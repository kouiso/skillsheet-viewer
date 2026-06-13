import { describe, expect, it } from 'vitest';

import { type Block, blocksToMarkdown, splitMarkdownIntoBlocks } from './blocks';

const SAMPLE = `## 技術者プロファイル

| 項目 | 内容 |
| :--- | :--- |
| 氏名 | I・K |

<details open>
<summary><h2>スキル・経験年数</h2></summary>

| 言語 | TypeScript |

</details>

## 経歴

### ◆ 株式会社az

#### ■ 1. mypappy

概要テキスト。
`;

const toBlocks = (segments: { markdown: string }[]): Block[] =>
  segments.map((data, order) => ({ id: String(order), type: 'markdown' as const, order, data }));

describe('splitMarkdownIntoBlocks', () => {
  it('分割→連結で元の文書に一致する（無損失）', () => {
    const segments = splitMarkdownIntoBlocks(SAMPLE);
    expect(blocksToMarkdown(toBlocks(segments))).toBe(SAMPLE);
  });

  it('構造境界（見出し / <details>）ごとにブロックが分かれる', () => {
    const segments = splitMarkdownIntoBlocks(SAMPLE);
    // 先頭ブロックは「## 技術者プロファイル」から始まる
    expect(segments[0].markdown.startsWith('## 技術者プロファイル')).toBe(true);
    // <details> は独立したブロックの先頭になる
    expect(segments.some((s) => s.markdown.startsWith('<details'))).toBe(true);
    // 各見出しレベル(##/###/####)が境界になっている
    expect(segments.some((s) => s.markdown.startsWith('## 経歴'))).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('### ◆ 株式会社az'))).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('#### ■ 1. mypappy'))).toBe(true);
  });

  it('order は 0 始まりの昇順で連結順を決める', () => {
    const segments = splitMarkdownIntoBlocks(SAMPLE);
    // 逆順に並べても order でソートして連結されるため元に戻る
    const reversed = toBlocks(segments)
      .map((b) => ({ ...b }))
      .reverse();
    expect(blocksToMarkdown(reversed)).toBe(SAMPLE);
  });
});
