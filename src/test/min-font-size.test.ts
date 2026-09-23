import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/** 画面の固定px指定は12px以上。PDFのpt指定は別の検査で扱う。 */
const MIN_PX = 12;
const ROOTS = [path.resolve(import.meta.dirname, '../../app'), path.resolve(import.meta.dirname, '..')];
const EXTENSIONS = new Set(['.tsx', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'test-results']);

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, acc);
    else if (EXTENSIONS.has(path.extname(entry))) acc.push(full);
  }
  return acc;
}

// テストファイル自身のコメントに例として書いた数値を拾わないよう除外する。
const files = ROOTS.flatMap((root) => collectFiles(root)).filter(
  (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'),
);

/** `font-size: 9.5px;` と Tailwind の `text-[10px]` の両方を拾う。 */
const PATTERNS = [/font-size:\s*(\d+(?:\.\d+)?)px/g, /text-\[(\d+(?:\.\d+)?)px\]/g];

describe(`静的に書かれた文字サイズが ${MIN_PX}px を下回らない`, () => {
  it('閲覧画面・編集画面の全ファイルで下限を満たす', () => {
    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        for (const pattern of PATTERNS) {
          pattern.lastIndex = 0;
          for (const match of line.matchAll(pattern)) {
            if (Number.parseFloat(match[1]) < MIN_PX) {
              violations.push(`${path.relative(process.cwd(), file)}:${index + 1} → ${match[0]}`);
            }
          }
        }
      });
    }
    expect(violations, `${MIN_PX}px 未満の文字サイズ:\n${violations.join('\n')}`).toEqual([]);
  });

  it('走査対象のファイルを実際に読めている', () => {
    expect(files.length).toBeGreaterThan(50);
  });
});
