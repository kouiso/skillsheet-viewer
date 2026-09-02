#!/usr/bin/env node
/**
 * `@sentry/*` / `posthog-js` への直接依存を、窓口（src/lib/observability/*）と
 * SDK 初期化に必要な数ファイルだけに閉じ込める。
 *
 * 「送らんものを型と lint で表現する」設計の要。アプリコードが直接 SDK を呼べる状態だと、
 * 次の1行で `scrubSentryEvent`/`captureError` の窓口を素通りできてしまう。
 *
 * `Sentry.setUser(` / `posthog.identify(` は許可リストの中でも全面禁止
 * （ユーザー識別を送らない設計そのものを、機械的に固定する）。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { cwd } from 'node:process';

const ROOT = cwd();
const TARGET_DIRS = [
  'app',
  'src',
  'next.config.ts',
  'instrumentation.ts',
  'instrumentation-client.ts',
  'sentry.server.config.ts',
];
const SKIP_DIR_NAMES = new Set(['node_modules', '.next', '.git']);

// SDK を直接 import してよい唯一の場所。ここを増やすときは、なぜ窓口を経由できないかを
// コメントで説明すること（バンドラ層をまたぐ・初期化そのものである等）。
const ALLOWED_DIRECT_IMPORT_FILES = new Set(
  [
    'next.config.ts',
    'instrumentation.ts',
    'instrumentation-client.ts',
    'sentry.server.config.ts',
    'src/lib/observability/sentry-options.server.ts',
    'src/lib/observability/sentry-options.client.ts',
    'src/server/report-error.ts',
  ].map((p) => join(ROOT, p)),
);

// `import type` は実行時コードを生成しない（Sentry.setUser 等を呼びようがない）ので許可する。
// sentry-options.ts が型だけを共有ファイルから参照するために使っている。
// `import(...)` の動的呼び出し（report-error.ts が isSentryEnabled() 判定後にのみ読み込むために使う）も拾う。
// `[^;]` は改行も含むため、`import {\n ... \n} from '...'` のような複数行 import も
// 1つの import 文の途中で `;` を跨がない限り検出できる
// （レビュー指摘: 旧実装は1行ずつ判定していたため、from が別行にある複数行 import を見逃していた）。
const IMPORT_PATTERN =
  /import\s+(?!type\s)[^;]*from\s+['"](@sentry\/[^'"]+|posthog-js)['"]|import\(\s*['"](@sentry\/[^'"]+|posthog-js)['"]\s*\)/su;
// `?.` によるオプショナルチェーン経由の呼び出し（`Sentry?.setUser(...)`）も対象にする。
// エイリアス経由の間接呼び出し（`const f = posthog.identify; f(...)`）は静的な行走査では
// 原理的に検出できず、AST 解析が要る。本スクリプトは「うっかり直接呼んでしまう」ことへの
// 防波堤（本来の防御は capture.ts の窓口一本化）なので、意図的な回避までは対象外とする。
const SET_USER_PATTERN = /Sentry\??\.setUser\s*\(/;
const IDENTIFY_PATTERN = /posthog\??\.identify\s*\(/;

function isTargetSourceFile(fileName) {
  return /\.(ts|tsx)$/.test(fileName) && !fileName.endsWith('.d.ts');
}

async function* walk(path) {
  const s = await stat(path);
  if (s.isDirectory()) {
    const entries = await readdir(path);
    for (const entry of entries) {
      if (SKIP_DIR_NAMES.has(entry)) continue;
      yield* walk(join(path, entry));
    }
  } else if (s.isFile() && isTargetSourceFile(path)) {
    yield path;
  }
}

let exitCode = 0;
const violations = [];

for (const target of TARGET_DIRS) {
  const fullPath = join(ROOT, target);
  try {
    for await (const filePath of walk(fullPath)) {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const allowedDirectImport = ALLOWED_DIRECT_IMPORT_FILES.has(filePath);

      if (!allowedDirectImport) {
        // import 文は複数行にまたがりうるため、ファイル全文に対して 's' フラグ付きで検査する
        // （1行ずつの走査だと `from '...'` が別行にある複数行 import を見逃す）。
        const importPattern = new RegExp(IMPORT_PATTERN.source, `${IMPORT_PATTERN.flags}g`);
        for (const match of content.matchAll(importPattern)) {
          const line = content.slice(0, match.index).split('\n').length;
          if (lines[line - 1]?.trim().startsWith('//')) continue;
          violations.push({
            file: relative(ROOT, filePath),
            line,
            reason: '@sentry/* / posthog-js を直接 import している（src/lib/observability/capture.ts 経由にすること）',
          });
          exitCode = 1;
        }
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//')) continue;

        if (SET_USER_PATTERN.test(line)) {
          violations.push({ file: relative(ROOT, filePath), line: i + 1, reason: 'Sentry.setUser() は全面禁止' });
          exitCode = 1;
        }
        if (IDENTIFY_PATTERN.test(line)) {
          violations.push({ file: relative(ROOT, filePath), line: i + 1, reason: 'posthog.identify() は全面禁止' });
          exitCode = 1;
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

if (violations.length > 0) {
  console.error('telemetry import ゲートに違反しています:');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.reason}`);
  }
} else {
  console.log('telemetry import ゲート: 違反なし。');
}

process.exit(exitCode);
