import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Issue #198（bg-primary × 白文字がライトテーマで 3.74:1 と WCAG AA 未達）は
 * 一度直したあとも `builder-client.tsx` の桁揃えトグル / シート切替、`ui/calendar.tsx` の
 * 選択日、パレットチップの hover と、4 回にわたって別の場所へ再発した。
 *
 * 色トークン単体の検査（contrast.test.ts）では「どの組み合わせで使われたか」を見られないため、
 * ここではソースを走査して**危険な組み合わせそのもの**を禁止する。
 *
 * 検出するのは次の 2 パターンだけに絞り、図形（ドット・バー・アイコン）用途の
 * `bg-primary` / `text-primary` は誤検出しない（図形は 3:1 で足りるため）。
 *   1. 同じ className に `bg-primary` と前景色（text-primary-foreground / text-on-accent）が同居
 *   2. 同じ className に `text-primary` と文字サイズ指定（text-sm 等）が同居 = 本文として使っている
 */
const ROOTS = [path.resolve(import.meta.dirname, '../../app'), path.resolve(import.meta.dirname, '..')];
const EXTENSIONS = new Set(['.tsx', '.ts', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'test-results']);

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc);
    } else if (EXTENSIONS.has(path.extname(entry))) {
      acc.push(full);
    }
  }
  return acc;
}

/** `bg-primary` / `text-primary` を「派生トークンでも透明度付きでもない素の指定」として拾う。 */
const BARE_BG_PRIMARY = /(?<![-\w])bg-primary(?![-/\w])/;
const BARE_TEXT_PRIMARY = /(?<![-\w])text-primary(?![-/\w])/;
const PRIMARY_FOREGROUND = /(?<![-\w])text-(?:primary-foreground|on-accent)(?![-\w])/;
const TEXT_SIZE = /(?<![-\w])text-(?:xs|sm|base|lg|xl|\d?xl|\[[^\]]+\])(?![-\w])/;

/** 行から className / class の中身を粗く取り出す。テンプレートリテラルも含める。 */
function classStrings(line: string): string[] {
  const matches = line.match(/class(?:Name)?\s*=\s*(?:"[^"]*"|'[^']*'|\{`[^`]*`\}|\{'[^']*'\}|\{"[^"]*"\})/g);
  return matches ?? [];
}

const files = ROOTS.flatMap((root) => collectFiles(root));

describe('bg-primary / text-primary の AA 未達な使い方を禁止する（Issue #198 再発防止）', () => {
  it('bg-primary と白系前景色を同じ要素で使っていない', () => {
    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        for (const cls of classStrings(line)) {
          if (BARE_BG_PRIMARY.test(cls) && PRIMARY_FOREGROUND.test(cls)) {
            violations.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
          }
        }
      });
    }
    expect(
      violations,
      `bg-primary は白文字と組むと 3.74:1。--primary-dark を使うこと:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('text-primary を本文の文字色として使っていない', () => {
    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        for (const cls of classStrings(line)) {
          if (BARE_TEXT_PRIMARY.test(cls) && TEXT_SIZE.test(cls)) {
            violations.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
          }
        }
      });
    }
    expect(
      violations,
      `text-primary は本文だと 3.36〜3.74:1。--primary-dark を使うこと:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('走査対象のファイルを実際に読めている（検査が空振りしていないことの確認）', () => {
    expect(files.length).toBeGreaterThan(50);
  });
});
