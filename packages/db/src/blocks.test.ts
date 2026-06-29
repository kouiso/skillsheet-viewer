import { describe, expect, it } from 'vitest';

import {
  type Block,
  type BlockInput,
  blocksToMarkdown,
  isBlockInput,
  isBlockInputEmpty,
  isMarkdownBlockData,
  isSkillsBlockData,
  isTableBlockData,
  normalizeTableBlockData,
  type SkillsBlockData,
  skillsBlockToMarkdown,
  splitMarkdownIntoBlocks,
  type TableBlockData,
  tableBlockToMarkdown,
} from './blocks';

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

const TABLE: TableBlockData = {
  columns: [
    { label: '左', align: 'left' },
    { label: '中', align: 'center' },
    { label: '右', align: 'right' },
  ],
  rows: [['a', 'b', 'c']],
};

describe('tableBlockToMarkdown', () => {
  it('3 種 alignment の GFM 表を出力する', () => {
    expect(tableBlockToMarkdown(TABLE)).toBe(
      ['| 左 | 中 | 右 |', '| :--- | :---: | ---: |', '| a | b | c |'].join('\n'),
    );
  });

  it('セル内の `|` をエスケープする', () => {
    const data: TableBlockData = {
      columns: [{ label: 'a|b', align: 'left' }],
      rows: [['x|y']],
    };
    expect(tableBlockToMarkdown(data)).toBe(['| a\\|b |', '| :--- |', '| x\\|y |'].join('\n'));
  });

  it('空セルは半角スペースになる（表ずれ防止）', () => {
    const data: TableBlockData = {
      columns: [
        { label: '', align: 'left' },
        { label: 'b', align: 'left' },
      ],
      rows: [['', 'v']],
    };
    expect(tableBlockToMarkdown(data)).toBe(['|   | b |', '| :--- | :--- |', '|   | v |'].join('\n'));
  });

  it('セル内改行は半角スペースへ置換する（複数行貼り付けの表崩れ防止）', () => {
    const data: TableBlockData = {
      columns: [{ label: 'h', align: 'left' }],
      rows: [['1\n2\r\n3']],
    };
    expect(tableBlockToMarkdown(data)).toBe(['| h |', '| :--- |', '| 1 2 3 |'].join('\n'));
  });

  it('ragged 行を列数ちょうどに正規化する（不足は空、超過は切り捨て）', () => {
    const data: TableBlockData = {
      columns: [
        { label: 'a', align: 'left' },
        { label: 'b', align: 'left' },
      ],
      rows: [['1'], ['1', '2', '3']],
    };
    expect(tableBlockToMarkdown(data)).toBe(['| a | b |', '| :--- | :--- |', '| 1 |   |', '| 1 | 2 |'].join('\n'));
  });
});

const SKILLS: SkillsBlockData = {
  category: 'プログラミング言語',
  skills: [
    { name: 'TypeScript', years: 3, level: '実務経験あり' },
    { name: 'Go', years: 1, level: '業務利用可' },
  ],
};

describe('skillsBlockToMarkdown', () => {
  it('カテゴリ見出し＋スキル表を出力する', () => {
    const md = skillsBlockToMarkdown(SKILLS);
    expect(md).toContain('### プログラミング言語');
    expect(md).toContain('| スキル | 経験年数 | 習熟度 |');
    expect(md).toContain('| TypeScript | 3年 | 実務経験あり |');
    expect(md).toContain('| Go | 1年 | 業務利用可 |');
  });

  it('カテゴリ空文字のときは見出し行を出力しない', () => {
    const md = skillsBlockToMarkdown({ ...SKILLS, category: '' });
    expect(md).not.toContain('###');
    expect(md).toContain('| TypeScript |');
  });

  it('スキルが 0 件のときは空の表ヘッダを出力する', () => {
    const md = skillsBlockToMarkdown({ category: '', skills: [] });
    expect(md).toContain('| スキル | 経験年数 | 習熟度 |');
    expect(md).toContain('| :--- | :---: | :--- |');
  });

  it('years=0 は "-" で出力する', () => {
    const md = skillsBlockToMarkdown({ category: '', skills: [{ name: 'Rust', years: 0, level: '学習中' }] });
    expect(md).toContain('| Rust | - | 学習中 |');
  });
});

describe('blocksToMarkdown — type 別 dispatch', () => {
  it('markdown と table を混在して 1 本の markdown に連結する', () => {
    const blocks: Block[] = [
      { id: 'm', type: 'markdown', order: 0, data: { markdown: '## 見出し' } },
      { id: 't', type: 'table', order: 1, data: TABLE },
    ];
    expect(blocksToMarkdown(blocks)).toBe(
      ['## 見出し', '| 左 | 中 | 右 |', '| :--- | :---: | ---: |', '| a | b | c |'].join('\n'),
    );
  });

  it('後方互換: markdown のみのブロックは従来どおり連結する', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'markdown', order: 0, data: { markdown: 'A' } },
      { id: 'b', type: 'markdown', order: 1, data: { markdown: 'B' } },
    ];
    expect(blocksToMarkdown(blocks)).toBe('A\nB');
  });

  it('skills ブロックを GFM 表に変換して連結する', () => {
    const blocks: Block[] = [
      { id: 'm', type: 'markdown', order: 0, data: { markdown: '## スキル' } },
      { id: 's', type: 'skills', order: 1, data: SKILLS },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('## スキル');
    expect(md).toContain('### プログラミング言語');
    expect(md).toContain('| TypeScript | 3年 | 実務経験あり |');
  });
});

describe('バリデータ', () => {
  it('isMarkdownBlockData', () => {
    expect(isMarkdownBlockData({ markdown: 'x' })).toBe(true);
    expect(isMarkdownBlockData({ markdown: 1 })).toBe(false);
    expect(isMarkdownBlockData(null)).toBe(false);
  });

  it('isTableBlockData', () => {
    expect(isTableBlockData(TABLE)).toBe(true);
    // 列ゼロは不正
    expect(isTableBlockData({ columns: [], rows: [] })).toBe(false);
    // align が列挙外
    expect(isTableBlockData({ columns: [{ label: 'a', align: 'middle' }], rows: [] })).toBe(false);
    // rows が配列でない
    expect(isTableBlockData({ columns: [{ label: 'a', align: 'left' }], rows: 'x' })).toBe(false);
    // セルが文字列でない
    expect(isTableBlockData({ columns: [{ label: 'a', align: 'left' }], rows: [[1]] })).toBe(false);
  });

  it('isSkillsBlockData', () => {
    expect(isSkillsBlockData(SKILLS)).toBe(true);
    expect(isSkillsBlockData({ category: 'x', skills: [] })).toBe(true);
    // category が文字列でない
    expect(isSkillsBlockData({ category: 1, skills: [] })).toBe(false);
    // skills が配列でない
    expect(isSkillsBlockData({ category: 'x', skills: 'y' })).toBe(false);
    // スキルエントリが不正（years が文字列）
    expect(isSkillsBlockData({ category: 'x', skills: [{ name: 'A', years: '3', level: 'ok' }] })).toBe(false);
    expect(isSkillsBlockData(null)).toBe(false);
  });

  it('isBlockInput', () => {
    expect(isBlockInput({ type: 'markdown', data: { markdown: 'x' } })).toBe(true);
    expect(isBlockInput({ type: 'table', data: TABLE })).toBe(true);
    expect(isBlockInput({ type: 'skills', data: SKILLS })).toBe(true);
    expect(isBlockInput({ type: 'unknown', data: {} })).toBe(false);
    expect(isBlockInput({ type: 'table', data: { columns: [], rows: [] } })).toBe(false);
  });

  it('isBlockInputEmpty', () => {
    expect(isBlockInputEmpty({ type: 'markdown', data: { markdown: '   ' } })).toBe(true);
    expect(isBlockInputEmpty({ type: 'markdown', data: { markdown: 'x' } })).toBe(false);
    // 列ゼロ、または全 label 空 かつ 全セル空 → 空
    const emptyTable: BlockInput = {
      type: 'table',
      data: {
        columns: [
          { label: '', align: 'left' },
          { label: ' ', align: 'left' },
        ],
        rows: [['', '  ']],
      },
    };
    expect(isBlockInputEmpty(emptyTable)).toBe(true);
    // label があれば空ではない
    expect(isBlockInputEmpty({ type: 'table', data: TABLE })).toBe(false);
    // skills: カテゴリ空 かつ スキル 0 件 → 空
    expect(isBlockInputEmpty({ type: 'skills', data: { category: '', skills: [] } })).toBe(true);
    expect(isBlockInputEmpty({ type: 'skills', data: { category: '  ', skills: [] } })).toBe(true);
    // スキルがあれば空ではない
    expect(isBlockInputEmpty({ type: 'skills', data: SKILLS })).toBe(false);
  });

  it('normalizeTableBlockData は行を列数へ正規化する', () => {
    const data: TableBlockData = {
      columns: [
        { label: 'a', align: 'left' },
        { label: 'b', align: 'left' },
      ],
      rows: [['1'], ['1', '2', '3']],
    };
    expect(normalizeTableBlockData(data).rows).toEqual([
      ['1', ''],
      ['1', '2'],
    ]);
  });
});
