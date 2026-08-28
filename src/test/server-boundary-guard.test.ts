import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * サーバ専用モジュールがクライアントバンドルへ紛れ込むのを止める。
 *
 * 画面側の真にサーバ専用なファイルには `server-only` を入れてビルドで落としているが、
 * `src/db` は CLI スクリプト・E2E・vitest からも普通の Node として読まれるライブラリなので
 * `server-only`（Next.js 前提の毒薬パッケージ）を入れると、それらの実行が全部落ちる
 * （実際に bootstrap-owner が起動できなくなった）。
 *
 * そこで DB 側は「`'use client'` のファイルから DB のサーバ専用な読み込み口を使っていないか」を
 * ソース走査で見張る。漏れると DATABASE_URL や巨大なドライバがクライアントに載る。
 */
const ROOTS = [path.resolve(import.meta.dirname, '../../app'), path.resolve(import.meta.dirname, '..')];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'test-results']);

/** クライアントから読んではいけない読み込み口。型だけの import は実行時に消えるので対象外。 */
const SERVER_ONLY_SPECIFIERS = [
  '@/db',
  '@/db/schema',
  '@/db/viewer-rate-limit',
  '@/lib/auth',
  '@/server/session',
  '@/server/github-sheets',
  '@/server/sheets-cache',
  '@/server/viewer-rate-limit',
];

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, acc);
    else if (EXTENSIONS.has(path.extname(entry))) acc.push(full);
  }
  return acc;
}

const files = ROOTS.flatMap((root) => collectFiles(root));

/** `import type { X } from '...'` と `import { type X } from '...'` だけの行は値を持ち込まない。 */
function isTypeOnlyImport(statement: string): boolean {
  if (/^import\s+type\b/.test(statement)) return true;
  // 既定 import と名前空間 import は値。波括弧の中身が全部 type でも見逃してはいけない
  // （`import db, { type X } from '...'` が素通りしていた）。
  const clause = statement.replace(/^import\s+/, '').replace(/\s+from[\s\S]*$/, '');
  if (/^(?:\*\s+as\s+\w+|\w+)\s*(?:,|$)/.test(clause)) return false;
  const braces = statement.match(/\{([^}]*)\}/);
  if (!braces) return false;
  const names = braces[1]
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  return names.length > 0 && names.every((n) => n.startsWith('type '));
}

describe("'use client' のファイルがサーバ専用モジュールを値として読み込んでいない", () => {
  it('クライアント境界を越えた import が無い', () => {
    const violations: string[] = [];
    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const source = readFileSync(file, 'utf-8');
      if (!/^\s*['"]use client['"]/m.test(source)) continue;

      for (const statement of source.match(/^import[\s\S]*?from\s+['"][^'"]+['"];?$/gm) ?? []) {
        const specifier = statement.match(/from\s+['"]([^'"]+)['"]/)?.[1];
        if (!specifier || !SERVER_ONLY_SPECIFIERS.includes(specifier)) continue;
        if (isTypeOnlyImport(statement)) continue;
        violations.push(`${path.relative(process.cwd(), file)} → ${specifier}`);
      }

      // 副作用 import（`import '@/db';`）も値を持ち込む。from が無いので上の正規表現に当たらない。
      for (const match of source.matchAll(/^import\s+['"]([^'"]+)['"];?$/gm)) {
        const specifier = match[1];
        if (specifier && SERVER_ONLY_SPECIFIERS.includes(specifier)) {
          violations.push(`${path.relative(process.cwd(), file)} → ${specifier}`);
        }
      }
    }
    expect(
      violations,
      `'use client' から サーバ専用モジュールを値で import しています:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('走査対象のファイルを実際に読めている', () => {
    expect(files.length).toBeGreaterThan(50);
  });
});
