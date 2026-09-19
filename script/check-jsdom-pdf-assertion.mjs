#!/usr/bin/env node
/**
 * jsdom 環境で走るテスト（*.test.tsx / *.spec.tsx のうち *.node.test.tsx 以外）に、
 * PDF フォント・グリフ・描画に関する主張を書かないことを機械的に確認する。
 *
 * jsdom では @react-pdf/renderer の renderToBuffer / Font 操作が別 realm の Uint8Array
 * 判定で壊れるため、これらの検証は *.node.test.tsx（vitest.config.pdf.ts / node）側で
 * 行う決まりとする。
 *
 * あわせて、3本の vitest config（jsdom / node / pdf）のどれにも拾われないテスト
 * ファイルが静かに無視されないよう、カバレッジ外の配置を検出して失敗させる。
 * - jsdom: 既定 include（src/db/**・script/**・*.node.test.* を除く全 *.test.*）
 * - node:  src/db/**・script/** の *.test.ts と全 *.node.test.ts
 * - pdf:   全 *.node.test.tsx
 * したがって src/db/**・script/** 配下の *.test.tsx / *.spec.tsx はどの config にも
 * 入らず、置かれても実行されない。node 側の include 拡張か *.node.test.tsx への
 * リネームが必要。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { cwd } from 'node:process';

const ROOT = cwd();
const TARGET_DIRS = [join(ROOT, 'src'), join(ROOT, 'app')];
const UNCOVERED_TEST_DIRS = [join(ROOT, 'src', 'db'), join(ROOT, 'script')];

const FORBIDDEN_PATTERNS = [
  { pattern: /from\s+['"]@react-pdf\/renderer['"]/, reason: '@react-pdf/renderer を直接 import している' },
  { pattern: /from\s+['"]pdfjs-dist['"]/, reason: 'pdfjs-dist を直接 import している' },
  { pattern: /renderToBuffer\s*\(/, reason: 'renderToBuffer を直接呼んでいる' },
  { pattern: /Font\.register\s*\(/, reason: 'Font.register を直接呼んでいる' },
];

/** *.test.tsx / *.spec.tsx から *.node.test.tsx / *.node.spec.tsx を除く */
function isJsdomTestFile(fileName) {
  if (fileName.endsWith('.node.test.tsx') || fileName.endsWith('.node.spec.tsx')) return false;
  return fileName.endsWith('.test.tsx') || fileName.endsWith('.spec.tsx');
}

/** *.test.tsx / *.spec.tsx すべて（node.test 系を含む） */
function isAnyTsxTestFile(fileName) {
  return fileName.endsWith('.test.tsx') || fileName.endsWith('.spec.tsx');
}

async function* walk(dir, match) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      yield* walk(fullPath, match);
    } else if (s.isFile() && match(entry)) {
      yield fullPath;
    }
  }
}

let exitCode = 0;
const violations = [];

for (const dir of TARGET_DIRS) {
  for await (const filePath of walk(dir, isJsdomTestFile)) {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('//')) continue;
      for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({ file: relative(ROOT, filePath), line: i + 1, reason });
          exitCode = 1;
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('jsdom テストに PDF フォント・グリフ・描画の主張が含まれています:');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.reason}`);
  }
  console.error('上記は *.node.test.tsx（vitest.config.pdf.ts / node 環境）側に移動してください。');
} else {
  console.log('jsdom テストに PDF フォント・グリフ・描画の主張は見つかりませんでした。');
}

const uncovered = [];
for (const dir of UNCOVERED_TEST_DIRS) {
  for await (const filePath of walk(dir, isAnyTsxTestFile)) {
    uncovered.push(relative(ROOT, filePath).split(sep).join('/'));
  }
}

if (uncovered.length > 0) {
  console.error('どの vitest config にも拾われないテストファイルが見つかりました:');
  for (const f of uncovered) {
    console.error(`  ${f}`);
  }
  console.error('src/db/**・script/** 配下の *.test.tsx / *.spec.tsx は jsdom・node・pdf の');
  console.error('いずれの include にも入りません。*.test.ts（node config）か *.node.test.tsx');
  console.error('（pdf config）にするか、テストを src/component 側へ移動してください。');
  exitCode = 1;
} else {
  console.log('カバレッジ外のテストファイルは見つかりませんでした。');
}

process.exit(exitCode);
