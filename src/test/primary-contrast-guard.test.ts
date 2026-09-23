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
 * 検出するのは次の 3 パターンだけに絞り、図形（ドット・バー・アイコン）用途の
 * `bg-primary` / `text-primary` は誤検出しない（図形は 3:1 で足りるため）。
 *   1. 同じ className に `bg-primary` と前景色（text-primary-foreground / text-on-accent）が同居
 *   2. 同じ className に `text-primary` と文字サイズ指定（text-sm 等）が同居 = 本文として使っている
 *   3. 生の .css 宣言ブロックで `background: var(--primary)` と on-accent 系の文字色が同居
 *      （Tailwind の className しか見ないパターン1・2だと `.btn.primary { background: var(--primary); color: var(--on-accent); }`
 *      のような生CSSのルールを素通りする。#198 がここから4回目に再発したのはこの穴のため）
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

/**
 * .css を素朴にブレース対応でスキャンし、「入れ子ルールを持たない末端の宣言ブロック」だけを
 * {selector, declarations} で返す。`@media (...) { .foo { ... } }` のような1段ネストも
 * 中身の `.foo { ... }` を末端ブロックとして拾う。
 */
function extractCssRuleBlocks(css: string): { selector: string; declarations: string }[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: { selector: string; declarations: string }[] = [];
  const stack: { bodyStart: number; selectorStart: number; hasNestedRule: boolean }[] = [];
  let selectorStart = 0;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === '{') {
      if (stack.length > 0) stack[stack.length - 1].hasNestedRule = true;
      stack.push({ bodyStart: i + 1, selectorStart, hasNestedRule: false });
      selectorStart = i + 1;
    } else if (ch === '}') {
      const frame = stack.pop();
      if (frame && !frame.hasNestedRule) {
        blocks.push({
          selector: noComments.slice(frame.selectorStart, frame.bodyStart - 1).trim(),
          declarations: noComments.slice(frame.bodyStart, i),
        });
      }
      selectorStart = i + 1;
    }
  }
  return blocks;
}

/** ブロック内の宣言を `プロパティ: 値` の配列に割って前後の空白を畳む。 */
function declarationList(declarations: string): string[] {
  return declarations
    .split(';')
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const BARE_PRIMARY_BG = /^background(?:-color)?:\s*var\(--primary\)(?:\s*!important)?$/;
const ON_ACCENT_LIKE_TEXT =
  /^color:\s*(?:var\(--on-accent\)|var\(--primary-foreground\)|#fff(?:fff)?|white)(?:\s*!important)?$/i;

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

  it('生の.css宣言ブロックで on-accent 系の文字色を素の --primary 背景に載せていない', () => {
    const violations: string[] = [];
    for (const file of files) {
      if (path.extname(file) !== '.css') continue;
      const css = readFileSync(file, 'utf-8');
      for (const { selector, declarations } of extractCssRuleBlocks(css)) {
        const decls = declarationList(declarations);
        const hasBarePrimaryBg = decls.some((d) => BARE_PRIMARY_BG.test(d));
        const hasOnAccentText = decls.some((d) => ON_ACCENT_LIKE_TEXT.test(d));
        if (hasBarePrimaryBg && hasOnAccentText) {
          violations.push(`${path.relative(process.cwd(), file)}: ${selector}`);
        }
      }
    }
    expect(
      violations,
      `background: var(--primary) に on-accent系の文字色を載せるとライトで3.74:1。--primary-dark を使うこと:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('走査対象のファイルを実際に読めている（検査が空振りしていないことの確認）', () => {
    expect(files.length).toBeGreaterThan(50);
  });
});
