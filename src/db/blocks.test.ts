import { describe, expect, it } from 'vitest';

import {
  type Block,
  type BlockInput,
  blockJoinSeparator,
  blocksToMarkdown,
  type ExperienceBlockData,
  experienceBlockToMarkdown,
  filterVisibleProjectData,
  isBlockInput,
  isBlockInputEmpty,
  isExperienceBlockData,
  isMarkdownBlockData,
  isProfileBlockData,
  isProjectBlockData,
  isSkillsBlockData,
  isStatsBlockData,
  isTableBlockData,
  normalizeTableBlockData,
  type ProfileBlockData,
  type ProjectBlockData,
  profileBlockToMarkdown,
  projectBlockToMarkdown,
  type SkillsBlockData,
  type StatsBlockData,
  skillsBlockToMarkdown,
  splitMarkdownIntoBlocks,
  statsBlockToMarkdown,
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

### ◆ Q 社（自社サービス事業会社）

#### ■ 1. マッチングアプリの開発

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
    expect(segments[0].markdown.startsWith('## 技術者プロファイル')).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('<details'))).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('## 経歴'))).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('### ◆ Q 社（自社サービス事業会社）'))).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('#### ■ 1. マッチングアプリの開発'))).toBe(true);
  });

  it('order は 0 始まりの昇順で連結順を決める', () => {
    const segments = splitMarkdownIntoBlocks(SAMPLE);
    const reversed = toBlocks(segments)
      .map((b) => ({ ...b }))
      .reverse();
    expect(blocksToMarkdown(reversed)).toBe(SAMPLE);
  });

  it('空文字列は空文字の1セグメントを返す（例外を投げない）', () => {
    expect(splitMarkdownIntoBlocks('')).toEqual([{ markdown: '' }]);
  });

  it('空白のみの文字列は1つのセグメントとして返す', () => {
    const segments = splitMarkdownIntoBlocks('   \n\n  ');
    expect(segments).toHaveLength(1);
    expect(segments[0].markdown).toBe('   \n\n  ');
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

  it('推しがあるときだけ推し列を足す', () => {
    const md = skillsBlockToMarkdown({
      ...SKILLS,
      skills: [{ ...SKILLS.skills[0], featured: true }, SKILLS.skills[1]],
    });
    expect(md).toContain('| スキル | 経験年数 | 習熟度 | 推し |');
    expect(md).toContain('| TypeScript | 3年 | 実務経験あり | ✓ |');
    expect(md).toContain('| Go | 1年 | 業務利用可 |  |');
  });

  it('空のスキル表も推しモードでは推し列を維持する', () => {
    const md = skillsBlockToMarkdown({ category: 'その他', skills: [] }, true);
    expect(md).toContain('| スキル | 経験年数 | 習熟度 | 推し |');
    expect(md).toContain('| :--- | :---: | :--- | :---: |');
  });
});

const EXP: ExperienceBlockData = {
  company: '株式会社サンプル',
  startDate: '2020-04',
  endDate: '2023-03',
  role: 'フロントエンドエンジニア',
  description: 'React/TypeScript による SPA 開発',
};

describe('experienceBlockToMarkdown', () => {
  it('会社名・期間・職種・業務内容を含む markdown を出力する', () => {
    const md = experienceBlockToMarkdown(EXP);
    expect(md).toContain('### 株式会社サンプル（2020.04〜2023.03）');
    expect(md).toContain('| 期間 | 2020.04〜2023.03 |');
    expect(md).toContain('| 職種 | フロントエンドエンジニア |');
    expect(md).toContain('React/TypeScript による SPA 開発');
  });

  it('endDate が空のとき「現在」と表示する', () => {
    const md = experienceBlockToMarkdown({ ...EXP, endDate: '' });
    expect(md).toContain('〜現在');
    expect(md).toContain('| 期間 | 2020.04〜現在 |');
  });

  it('role が空のとき職種行を省略する', () => {
    const md = experienceBlockToMarkdown({ ...EXP, role: '' });
    expect(md).not.toContain('| 職種 |');
  });

  it('description が空のとき本文を省略する', () => {
    const md = experienceBlockToMarkdown({ ...EXP, description: '' });
    expect(md).not.toContain('React/TypeScript');
  });
});

describe('blocksToMarkdown — type 別 dispatch', () => {
  it('markdown と table を混在して 1 本の markdown に連結する（table 等の非 markdown 型が隣接する境界は空行区切り）', () => {
    // GFM テーブルは直前が空行でないと段落へ lazy continuation として飲み込まれ、
    // テーブルとして認識されない（区切り行がそのまま生テキスト表示される不具合の再発防止）。
    const blocks: Block[] = [
      { id: 'm', type: 'markdown', order: 0, data: { markdown: '## 見出し' } },
      { id: 't', type: 'table', order: 1, data: TABLE },
    ];
    expect(blocksToMarkdown(blocks)).toBe(
      ['## 見出し', '', '| 左 | 中 | 右 |', '| :--- | :---: | ---: |', '| a | b | c |'].join('\n'),
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

  it('推しモードは同一シートのすべての skills 表へ推し列を付ける', () => {
    const blocks: Block[] = [
      {
        id: 'featured',
        type: 'skills',
        order: 0,
        data: { ...SKILLS, skills: [{ ...SKILLS.skills[0], featured: true }] },
      },
      {
        id: 'plain',
        type: 'skills',
        order: 1,
        data: { category: 'バックエンド', skills: [{ name: 'Nest.js', years: 2, level: '業務利用可' }] },
      },
    ];

    const md = blocksToMarkdown(blocks);
    expect(md.match(/\| スキル \| 経験年数 \| 習熟度 \| 推し \|/g)).toHaveLength(2);
    expect(md).toContain('| Nest.js | 2年 | 業務利用可 |  |');
  });

  it('サニタイズ後に空となる推し名では推しモードを有効にしない', () => {
    const blocks: Block[] = [
      {
        id: 'skills',
        type: 'skills',
        order: 0,
        data: {
          category: '言語',
          skills: [
            { name: '<script>x</script>', years: 1, level: '学習中', featured: true },
            { name: 'TypeScript', years: 3, level: '実務経験あり' },
          ],
        },
      },
    ];
    expect(blocksToMarkdown(blocks)).not.toContain('| 推し |');
  });

  it('experience ブロックを markdown セクションへ変換して連結する', () => {
    const blocks: Block[] = [
      { id: 'm', type: 'markdown', order: 0, data: { markdown: '## 経歴' } },
      { id: 'e', type: 'experience', order: 1, data: EXP },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('## 経歴');
    expect(md).toContain('### 株式会社サンプル');
    expect(md).toContain('フロントエンドエンジニア');
  });

  it('中身が空のブロックは連結対象から除く（issue #128: 空 experience が「（現在）」を出さない）', () => {
    const blocks: Block[] = [
      { id: 'm', type: 'markdown', order: 0, data: { markdown: '## 職務経歴' } },
      {
        id: 'e',
        type: 'experience',
        order: 1,
        data: { company: '', startDate: '', endDate: '', role: '', description: '' },
      },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toBe('## 職務経歴');
    expect(md).not.toContain('現在');
  });

  it('空ブロックを除いても、直前ブロック判定（先頭 / セパレータ）が壊れない', () => {
    // 空ブロックが先頭に来ても、残る先頭要素が正しく i===0 として扱われることを確認する
    // （filter を sort の前・ループの外でやる必要があることの回帰テスト）。
    const blocks: Block[] = [
      {
        id: 'e',
        type: 'experience',
        order: 0,
        data: { company: '', startDate: '', endDate: '', role: '', description: '' },
      },
      { id: 'm1', type: 'markdown', order: 1, data: { markdown: '## 見出し' } },
      { id: 't', type: 'table', order: 2, data: TABLE },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toBe(['## 見出し', '', '| 左 | 中 | 右 |', '| :--- | :---: | ---: |', '| a | b | c |'].join('\n'));
  });
});

describe('blockJoinSeparator — 連結セパレータの単一の真実', () => {
  const TABLE_MD = ['| a | b |', '| :--- | :--- |', '| 1 | 2 |'].join('\n');

  it('markdown 同士は原則 \\n（ラウンドトリップ無損失を維持）', () => {
    expect(blockJoinSeparator('markdown', 'markdown', '本文段落')).toBe('\n');
  });

  it('後続 markdown が GFM テーブル行で始まる場合は \\n\\n（飲み込み防止）', () => {
    expect(blockJoinSeparator('markdown', 'markdown', TABLE_MD)).toBe('\n\n');
  });

  it('先頭に空行があってもテーブル始まりを検出する', () => {
    expect(blockJoinSeparator('markdown', 'markdown', `\n\n${TABLE_MD}`)).toBe('\n\n');
  });

  it('先頭がインデント付きテーブル行でも検出する', () => {
    expect(blockJoinSeparator('markdown', 'markdown', '  | a |\n  | :--- |')).toBe('\n\n');
  });

  it('非 markdown 型が絡む隣接は常に \\n\\n', () => {
    expect(blockJoinSeparator('markdown', 'table', TABLE_MD)).toBe('\n\n');
    expect(blockJoinSeparator('table', 'markdown', '本文')).toBe('\n\n');
    expect(blockJoinSeparator('skills', 'stats', '')).toBe('\n\n');
  });

  it('先頭が `|` 始まりでも区切り行を伴わない非テーブルなら \\n のまま（誤検出防止）', () => {
    // GFM テーブルは見出し行の直後に `| --- |` 形式の区切り行が必須。区切り行を伴わない
    // `|` 始まりの地の文（レビュー指摘: ASCII 表現やエスケープされたテーブルサンプル等）を
    // テーブルと誤認して \n\n に切り替えると、無損失ラウンドトリップの前提が崩れる。
    expect(blockJoinSeparator('markdown', 'markdown', '| これはテーブルではない普通の文章です')).toBe('\n');
  });

  // GFM は外側の `|` を省略できる。省略した表が段落へ飲み込まれると表として描画されない。
  it('外側の `|` を省いた表も表として扱う', () => {
    expect(blockJoinSeparator('markdown', 'markdown', 'a | b\n--- | ---')).toBe('\n\n');
    expect(blockJoinSeparator('markdown', 'markdown', 'a | b\n--- | --- |')).toBe('\n\n');
  });

  // `a | b` の次が `---`（1セル）は Setext 見出しであって表ではない。
  it('セル数が合わない `---` は Setext 見出しとして扱う', () => {
    expect(blockJoinSeparator('markdown', 'markdown', 'a | b\n---')).toBe('\n');
    expect(blockJoinSeparator('markdown', 'markdown', '|not a table|\n次の行も普通の文章')).toBe('\n');
  });
});

describe('blocksToMarkdown — markdown ブロック同士でも 2 本目がテーブル始まりなら空行区切り', () => {
  const TABLE_MD = ['| 言語 | 経験 |', '| :--- | :--- |', '| TS | 3年 |'].join('\n');

  it('段落 + テーブル始まりの markdown ブロックは空行で区切られテーブルが飲み込まれない', () => {
    const blocks: Block[] = [
      { id: 'p', type: 'markdown', order: 0, data: { markdown: '経歴の概要テキスト。' } },
      { id: 't', type: 'markdown', order: 1, data: { markdown: TABLE_MD } },
    ];
    const md = blocksToMarkdown(blocks);
    // テーブル直前が空行（\n\n）であることを確認する。
    expect(md).toBe(`経歴の概要テキスト。\n\n${TABLE_MD}`);
    // split→join のラウンドトリップで文字列が保存される（破壊されない）。
    const reassembled = blocksToMarkdown(
      splitMarkdownIntoBlocks(md).map((data, order) => ({ id: String(order), type: 'markdown' as const, order, data })),
    );
    expect(reassembled).toBe(md);
  });

  it('テーブルで始まらない markdown ブロック同士は従来どおり \\n 連結（無損失維持）', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'markdown', order: 0, data: { markdown: '段落A' } },
      { id: 'b', type: 'markdown', order: 1, data: { markdown: '段落B' } },
    ];
    expect(blocksToMarkdown(blocks)).toBe('段落A\n段落B');
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
    expect(isTableBlockData({ columns: [], rows: [] })).toBe(false);
    expect(isTableBlockData({ columns: [{ label: 'a', align: 'middle' }], rows: [] })).toBe(false);
    expect(isTableBlockData({ columns: [{ label: 'a', align: 'left' }], rows: 'x' })).toBe(false);
    expect(isTableBlockData({ columns: [{ label: 'a', align: 'left' }], rows: [[1]] })).toBe(false);
  });

  it('isSkillsBlockData', () => {
    expect(isSkillsBlockData(SKILLS)).toBe(true);
    expect(isSkillsBlockData({ category: 'x', skills: [] })).toBe(true);
    expect(isSkillsBlockData({ category: 'x', skills: [{ name: 'A', years: 3, level: 'ok', featured: true }] })).toBe(
      true,
    );
    expect(isSkillsBlockData({ category: 'x', skills: [{ name: 'A', years: 3, level: 'ok', featured: 'true' }] })).toBe(
      false,
    );
    expect(isSkillsBlockData({ category: 1, skills: [] })).toBe(false);
    expect(isSkillsBlockData({ category: 'x', skills: 'y' })).toBe(false);
    expect(isSkillsBlockData({ category: 'x', skills: [{ name: 'A', years: '3', level: 'ok' }] })).toBe(false);
    expect(isSkillsBlockData(null)).toBe(false);
  });

  it('isExperienceBlockData', () => {
    expect(isExperienceBlockData(EXP)).toBe(true);
    expect(isExperienceBlockData({ company: '', startDate: '', endDate: '', role: '', description: '' })).toBe(true);
    expect(isExperienceBlockData({ company: 'x', startDate: '2020', endDate: '', role: '' })).toBe(false);
    expect(isExperienceBlockData({ company: 1, startDate: '', endDate: '', role: '', description: '' })).toBe(false);
    expect(isExperienceBlockData(null)).toBe(false);
  });

  it('isBlockInput', () => {
    expect(isBlockInput({ type: 'markdown', data: { markdown: 'x' } })).toBe(true);
    expect(isBlockInput({ type: 'table', data: TABLE })).toBe(true);
    expect(isBlockInput({ type: 'skills', data: SKILLS })).toBe(true);
    expect(isBlockInput({ type: 'experience', data: EXP })).toBe(true);
    expect(isBlockInput({ type: 'unknown', data: {} })).toBe(false);
    expect(isBlockInput({ type: 'table', data: { columns: [], rows: [] } })).toBe(false);
  });

  it('isBlockInputEmpty', () => {
    expect(isBlockInputEmpty({ type: 'markdown', data: { markdown: '   ' } })).toBe(true);
    expect(isBlockInputEmpty({ type: 'markdown', data: { markdown: 'x' } })).toBe(false);
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
    expect(isBlockInputEmpty({ type: 'table', data: TABLE })).toBe(false);
    expect(isBlockInputEmpty({ type: 'skills', data: { category: '', skills: [] } })).toBe(true);
    expect(isBlockInputEmpty({ type: 'skills', data: { category: '  ', skills: [] } })).toBe(true);
    expect(isBlockInputEmpty({ type: 'skills', data: SKILLS })).toBe(false);
    expect(
      isBlockInputEmpty({
        type: 'experience',
        data: { company: '', startDate: '', endDate: '', role: '', description: '' },
      }),
    ).toBe(true);
    expect(
      isBlockInputEmpty({
        type: 'experience',
        data: { company: '  ', startDate: '', endDate: '', role: '  ', description: '' },
      }),
    ).toBe(true);
    expect(isBlockInputEmpty({ type: 'experience', data: EXP })).toBe(false);
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

// ---- A1: 新型ブロック（profile / stats / project）の検証とround-trip --------

const PROFILE: ProfileBlockData = {
  name: 'テスト太郎',
  title: 'フルスタックエンジニア',
  pr: 'テスト自己PR',
  strengths: ['TypeScript', 'Next.js'],
  meta: { age: '30歳', work: 'フルリモート' },
};

const STATS: StatsBlockData = {
  items: [
    { value: '5', unit: '年', label: 'エンジニア歴' },
    { value: '10', unit: '案件', label: 'プロジェクト数' },
  ],
};

const PROJECT: ProjectBlockData = {
  companies: [{ id: 'c1', name: '株式会社テスト', kind: 'SIer', period: '2020-01〜現在', note: '' }],
  items: [
    {
      id: 'p1',
      companyId: 'c1',
      title: 'テストシステム開発',
      scope: '5名',
      period: '2020-01〜2022-12',
      role: 'フロントエンド',
      team: '5名',
      tech: { lang: ['TypeScript'], fw: ['React'], db: ['PostgreSQL'], infra: ['AWS'], tools: ['Git'], collab: [] },
      process: ['要件定義', '設計', '実装'],
      duties: '業務内容テスト',
      acquired: '習得スキルテスト',
      comment: '',
    },
  ],
};

describe('isProfileBlockData', () => {
  it('有効なプロフィールデータを受け入れる', () => {
    expect(isProfileBlockData(PROFILE)).toBe(true);
  });

  it('name が文字列でなければ拒否', () => {
    expect(isProfileBlockData({ ...PROFILE, name: 123 })).toBe(false);
  });

  it('strengths が配列でなければ拒否', () => {
    expect(isProfileBlockData({ ...PROFILE, strengths: 'invalid' })).toBe(false);
  });

  it('meta がオブジェクトでなければ拒否', () => {
    expect(isProfileBlockData({ ...PROFILE, meta: null })).toBe(false);
  });

  // meta の値まで見ないと、profileBlockToMarkdown の trim() が実行時に落ちる。
  it('meta の値が文字列でなければ拒否', () => {
    expect(isProfileBlockData({ ...PROFILE, meta: { age: 30 } })).toBe(false);
    expect(isProfileBlockData({ ...PROFILE, meta: { age: null } })).toBe(false);
  });

  it('meta が配列なら拒否', () => {
    expect(isProfileBlockData({ ...PROFILE, meta: [] })).toBe(false);
  });

  it('null は拒否', () => {
    expect(isProfileBlockData(null)).toBe(false);
  });
});

describe('isStatsBlockData', () => {
  it('有効な統計データを受け入れる', () => {
    expect(isStatsBlockData(STATS)).toBe(true);
  });

  it('items が配列でなければ拒否', () => {
    expect(isStatsBlockData({ items: 'bad' })).toBe(false);
  });

  it('item.value が文字列でなければ拒否', () => {
    expect(isStatsBlockData({ items: [{ value: 1, unit: '年', label: 'x' }] })).toBe(false);
  });

  it('空の items 配列は有効', () => {
    expect(isStatsBlockData({ items: [] })).toBe(true);
  });
});

describe('isProjectBlockData', () => {
  it('有効な案件データを受け入れる', () => {
    expect(isProjectBlockData(PROJECT)).toBe(true);
  });

  it('companies が配列でなければ拒否', () => {
    expect(isProjectBlockData({ companies: 'bad', items: [] })).toBe(false);
  });

  it('items が配列でなければ拒否', () => {
    expect(isProjectBlockData({ companies: [], items: 'bad' })).toBe(false);
  });

  // 必須フィールドを見落とすと、projectBlockToMarkdown の trim() が実行時に落ちる。
  it('会社の必須項目が文字列でなければ拒否', () => {
    const [company] = PROJECT.companies;
    expect(isProjectBlockData({ ...PROJECT, companies: [{ ...company, kind: 1 }] })).toBe(false);
    expect(isProjectBlockData({ ...PROJECT, companies: [{ ...company, period: null }] })).toBe(false);
    expect(isProjectBlockData({ ...PROJECT, companies: [{ ...company, note: undefined }] })).toBe(false);
  });

  it('案件の必須項目が文字列でなければ拒否', () => {
    const [item] = PROJECT.items;
    expect(isProjectBlockData({ ...PROJECT, items: [{ ...item, title: 1 }] })).toBe(false);
    expect(isProjectBlockData({ ...PROJECT, items: [{ ...item, duties: null }] })).toBe(false);
    expect(isProjectBlockData({ ...PROJECT, items: [{ ...item, acquired: undefined }] })).toBe(false);
  });

  it('process の要素が文字列でなければ拒否', () => {
    const [item] = PROJECT.items;
    expect(isProjectBlockData({ ...PROJECT, items: [{ ...item, process: [1] }] })).toBe(false);
  });

  it('null は拒否', () => {
    expect(isProjectBlockData(null)).toBe(false);
  });
});

describe('profileBlockToMarkdown', () => {
  it('名前・肩書き・自己PR・強みを含む markdown を出力する', () => {
    const md = profileBlockToMarkdown(PROFILE);
    expect(md).toContain('# テスト太郎');
    expect(md).toContain('フルスタックエンジニア');
    expect(md).toContain('テスト自己PR');
    expect(md).toContain('TypeScript');
  });

  it('meta.age / meta.work が存在すれば表に出力する', () => {
    const md = profileBlockToMarkdown(PROFILE);
    expect(md).toContain('| 年齢 | 30歳 |');
    expect(md).toContain('| 勤務形態 | フルリモート |');
  });

  it('company が存在すれば所属会社として表に出力する（ビューア表示との PDF/markdown パリティ）', () => {
    const md = profileBlockToMarkdown({ ...PROFILE, company: '株式会社 RITMO' });
    expect(md).toContain('| 所属会社 | 株式会社 RITMO |');
  });

  it('company が未設定/空白のみなら所属会社行を出力しない', () => {
    expect(profileBlockToMarkdown(PROFILE)).not.toContain('所属会社');
    expect(profileBlockToMarkdown({ ...PROFILE, company: '  ' })).not.toContain('所属会社');
  });

  it('性別・資格・得意分野・得意業務（既知だが従来UI未対応だった4項目）も表に出力する（Issue #193）', () => {
    const md = profileBlockToMarkdown({
      ...PROFILE,
      meta: {
        ...PROFILE.meta,
        gender: '男',
        qualifications: '自動車普通車免許',
        specialties: 'フロントエンド',
        expertise: 'チーム運営',
      },
    });
    expect(md).toContain('| 性別 | 男 |');
    expect(md).toContain('| 資格 | 自動車普通車免許 |');
    expect(md).toContain('| 得意分野 | フロントエンド |');
    expect(md).toContain('| 得意業務 | チーム運営 |');
  });

  it('既知8項目に無い任意のキーも、キー名をラベルとして表に出力する（Issue #193 の自由項目）', () => {
    const md = profileBlockToMarkdown({ ...PROFILE, meta: { ...PROFILE.meta, 血液型: 'A型' } });
    expect(md).toContain('| 血液型 | A型 |');
  });

  it('既知項目 → 任意項目の順で並ぶ', () => {
    const md = profileBlockToMarkdown({
      ...PROFILE,
      meta: { 血液型: 'A型', age: '30歳', work: 'フルリモート' },
    });
    const ageIndex = md.indexOf('| 年齢 |');
    const workIndex = md.indexOf('| 勤務形態 |');
    const customIndex = md.indexOf('| 血液型 |');
    expect(ageIndex).toBeGreaterThan(-1);
    expect(ageIndex).toBeLessThan(workIndex);
    expect(workIndex).toBeLessThan(customIndex);
  });

  it('値が空文字/空白のみの項目は表に出さない', () => {
    const md = profileBlockToMarkdown({ ...PROFILE, meta: { ...PROFILE.meta, gender: '', qualifications: '  ' } });
    expect(md).not.toContain('| 性別 |');
    expect(md).not.toContain('| 資格 |');
  });

  // chatgpt-codex-connector レビュー指摘: PROFILE_META_LABELS[key] のブラケットアクセスは
  // key が Object.prototype のプロパティ名と一致すると継承メンバ（関数）を返し、
  // escapeCell が文字列以外を渡されて例外になっていた。ユーザーがエディタで
  // 自由に入力できるラベルだけで再現するため、通常の入力として扱い例外にしない。
  it('任意キーが constructor/toString 等の Object.prototype 予約語と一致してもクラッシュせず、キー名をラベルとして出力する', () => {
    expect(() =>
      profileBlockToMarkdown({ ...PROFILE, meta: { ...PROFILE.meta, constructor: '値1', toString: '値2' } }),
    ).not.toThrow();
    const md = profileBlockToMarkdown({ ...PROFILE, meta: { ...PROFILE.meta, constructor: '値1', toString: '値2' } });
    expect(md).toContain('| constructor | 値1 |');
    expect(md).toContain('| toString | 値2 |');
  });

  // chatgpt-codex-connector レビュー指摘: escapeCell が `<` `>` を素通ししていたため、
  // 自由入力に "Reference <URL>" のような文字列があると remark がインラインHTMLと
  // 誤認し、PDF描画（skill-sheet-document.tsx の INLINE_LEAF）がその部分を丸ごと
  // 落としていた（PDF/viewer間の表示不一致・内容欠落）。生成した markdown 自体に
  // 実体参照として残ることを確認する（デコード後にPDFへ literal な `<`/`>` が残る）。
  it('任意キーの値に < > を含んでも実体参照へエスケープし、生 HTML として解釈されない形で出力する', () => {
    const md = profileBlockToMarkdown({ ...PROFILE, meta: { ...PROFILE.meta, 参考: 'Reference <URL> here' } });
    expect(md).toContain('Reference &lt;URL&gt; here');
    expect(md).not.toContain('Reference <URL> here');
  });

  // 構造化ビューアはセルを素のテキストとして出す。markdown/PDF 側だけリンクや強調に
  // 化けると、同じデータの見え方が経路ごとに食い違う。
  it('セルの markdown インライン記法をエスケープする', () => {
    const md = profileBlockToMarkdown({
      ...PROFILE,
      meta: { ...PROFILE.meta, 参考: '[表示名](URL) *強調* `code` ~打消~ ![img](u)' },
    });
    expect(md).toContain('\\[表示名\\](URL)');
    expect(md).toContain('\\*強調\\*');
    expect(md).toContain('\\`code\\`');
    expect(md).toContain('\\~打消\\~');
    expect(md).toContain('\\!\\[img\\](u)');
  });
});

describe('statsBlockToMarkdown', () => {
  it('ラベル行・値行を含む GFM 表を出力する', () => {
    const md = statsBlockToMarkdown(STATS);
    expect(md).toContain('| エンジニア歴 | プロジェクト数 |');
    expect(md).toContain('| 5年 | 10案件 |');
  });

  it('items が空のとき空文字を返す', () => {
    expect(statsBlockToMarkdown({ items: [] })).toBe('');
  });
});

describe('projectBlockToMarkdown', () => {
  it('会社名・案件タイトル・期間・技術スタックを含む markdown を出力する', () => {
    const md = projectBlockToMarkdown(PROJECT);
    expect(md).toContain('### 株式会社テスト — テストシステム開発');
    expect(md).toContain('TypeScript');
    expect(md).toContain('業務内容テスト');
  });

  it('元シートから取り込んだ値は「担当領域」として出す（本人の言葉なので導出扱いにしない）', () => {
    expect(projectBlockToMarkdown(PROJECT)).toContain('| 担当領域 | 5名 |');
  });

  it('取り込んだ担当領域が無い場合は技術スタックから導出する（#240 / #241 — 正本に無い文言を保存しないため）', () => {
    const withoutScope: ProjectBlockData = {
      ...PROJECT,
      items: [{ ...PROJECT.items[0], scope: '' }],
    };
    expect(projectBlockToMarkdown(withoutScope)).toContain('| 技術領域 | Web |');
  });

  it('取り込んだ担当領域が無く技術スタックからも判定できない場合は技術領域の行を出さない', () => {
    const noSignal: ProjectBlockData = {
      ...PROJECT,
      items: [
        {
          ...PROJECT.items[0],
          scope: '',
          tech: { lang: [], fw: [], db: ['PostgreSQL'], infra: [], tools: ['Git'], collab: [] },
        },
      ],
    };
    expect(projectBlockToMarkdown(noSignal)).not.toContain('技術領域');
  });

  it('担当工程は画面と同じ7段モデルへ正規化し、対応表外の値は末尾に残す（#206）', () => {
    const withProcess: ProjectBlockData = {
      ...PROJECT,
      items: [
        {
          ...PROJECT.items[0],
          process: ['要件定義', '設計', '実装', '運用・保守'],
        },
      ],
    };
    const md = projectBlockToMarkdown(withProcess);
    expect(md).toContain('| 担当工程 | 要件定義, 実装・単体, 保守・運用, 設計 |');
    expect(md).not.toContain('| 担当工程 | 実装, 運用・保守');
  });

  it('会社概要文（note）と会社区分（kind）を出力する（#139）', () => {
    const withNote: ProjectBlockData = {
      companies: [{ ...PROJECT.companies[0], note: '大手SIベンダーにて複数プロジェクトに参画。' }],
      items: PROJECT.items,
    };
    const md = projectBlockToMarkdown(withNote);
    expect(md).toContain('大手SIベンダーにて複数プロジェクトに参画。');
    expect(md).toContain('| 会社区分 | SIer |');
  });

  it('note は見出し直後ではなく表の後ろに置く（見出し+表の隣接を維持し、PDFの改ページ結合制御を壊さない）', () => {
    const withNote: ProjectBlockData = {
      companies: [{ ...PROJECT.companies[0], note: '会社概要のテスト文。' }],
      items: PROJECT.items,
    };
    const md = projectBlockToMarkdown(withNote);
    const headingIndex = md.indexOf('### 株式会社テスト — テストシステム開発');
    const tableStartIndex = md.indexOf('| 項目 | 内容 |');
    const noteIndex = md.indexOf('会社概要のテスト文。');
    expect(headingIndex).toBeGreaterThanOrEqual(0);
    // 見出し直後〜表開始の間に note 由来の非空行が無い（見出し→表が隣接している）。
    const betweenHeadingAndTable = md
      .slice(headingIndex + '### 株式会社テスト — テストシステム開発'.length, tableStartIndex)
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(betweenHeadingAndTable).toEqual([]);
    expect(noteIndex).toBeGreaterThan(tableStartIndex);
  });

  it('note が "#" 等のブロック開始文字で始まっても独立した見出し等として解釈されないようエスケープする', () => {
    const withNote: ProjectBlockData = {
      companies: [{ ...PROJECT.companies[0], note: '# 偽の見出し\n- 偽のリスト' }],
      items: PROJECT.items,
    };
    const md = projectBlockToMarkdown(withNote);
    expect(md).toContain('\\# 偽の見出し');
    expect(md).toContain('\\- 偽のリスト');
  });

  it('note が Setext見出しの下線(=)・水平線/強調(_)・画像/リンク(![)で始まる行を含んでも構造化されないようエスケープする', () => {
    const withNote: ProjectBlockData = {
      companies: [
        {
          ...PROJECT.companies[0],
          note: '会社概要\n===\n___\n![機密](https://example.com/x.png)\n[リンク](https://example.com)',
        },
      ],
      items: PROJECT.items,
    };
    const md = projectBlockToMarkdown(withNote);
    expect(md).toContain('\\===');
    expect(md.split('\n')).not.toContain('===');
    // `_` は行頭のリスト等ではなく行中でも強調/水平線として解釈されうるインライン記号
    // のため、行内の全出現を escape する（`___` の3文字すべてに `\` が付く）。
    expect(md).toContain('\\_\\_\\_');
    // `!` だけの escape だと直後の `[機密](...)` がリンクとして解釈されてしまうため、
    // `!`・`[`・`]` を escape する（\!\[機密\]）。
    expect(md).toContain('\\!\\[機密\\]');
    expect(md).not.toContain('\\![機密]');
    expect(md).toContain('\\[リンク\\]');
  });

  it('note に元からバックスラッシュを含む文字列（例: エスケープ済みHTMLタグを意図した記述）があっても、後続のメタ文字エスケープと組み合わさって二重エスケープが消費され生HTMLとして復元されないよう、既存のバックスラッシュを先にエスケープする（レビュー指摘）', () => {
    const withNote: ProjectBlockData = {
      companies: [
        {
          ...PROJECT.companies[0],
          note: '説明文\n\\<img src="https://example.com/x.png">',
        },
      ],
      items: PROJECT.items,
    };
    const md = projectBlockToMarkdown(withNote);
    // remark は `\\`（連続する2つのバックスラッシュ）を「エスケープされたバックスラッシュ1文字」
    // として消費するため、既存のバックスラッシュを先にエスケープしていないと、後続で追加される
    // `<` の前のバックスラッシュと合わせて `\\<` になり、`<img ...>` が未エスケープの生HTMLとして
    // 復元されてしまう。既存のバックスラッシュを先に `\\` へエスケープしておくことで、
    // 都合3連続のバックスラッシュ（元のバックスラッシュのエスケープ分 + `<` のエスケープ分）になり、
    // remark 上でも「バックスラッシュ1文字 + エスケープされた `<`」として元の見た目を維持する。
    expect(md).toContain(`${'\\'.repeat(3)}<img`);
  });

  it('note内の行中（行頭以外）に出現する画像/リンク/強調記法もエスケープする（レビュー指摘: 従来は行頭アンカーの正規表現のため行中は素通りしていた）', () => {
    const withNote: ProjectBlockData = {
      companies: [
        {
          ...PROJECT.companies[0],
          note: '会社概要 ![機密](https://example.com/x.png) の説明。[リンク](https://example.com)も参照。*強調*は行中にもある。',
        },
      ],
      items: PROJECT.items,
    };
    const md = projectBlockToMarkdown(withNote);
    expect(md).toContain('\\!\\[機密\\]');
    expect(md).toContain('\\[リンク\\]');
    expect(md).toContain('\\*強調\\*');
  });

  it('note の行頭が4文字以上のインデントでもコードブロック化されないよう3文字までに削る', () => {
    const withNote: ProjectBlockData = {
      companies: [{ ...PROJECT.companies[0], note: '通常の文\n    4スペースインデントの行' }],
      items: PROJECT.items,
    };
    const md = projectBlockToMarkdown(withNote);
    expect(md).not.toContain('    4スペースインデントの行');
    expect(md).toContain('   4スペースインデントの行');
  });

  it('note の行頭がタブ・タブ混在インデントでもコードブロック化されないよう3文字までに削る', () => {
    const withNote: ProjectBlockData = {
      companies: [{ ...PROJECT.companies[0], note: '通常の文\n\tタブインデントの行\n \t混在インデントの行' }],
      items: PROJECT.items,
    };
    const md = projectBlockToMarkdown(withNote);
    expect(md).not.toContain('\tタブインデントの行');
    expect(md).toContain('   タブインデントの行');
    expect(md).not.toContain(' \t混在インデントの行');
    expect(md).toContain('   混在インデントの行');
  });

  it('note が空文字のときは本文段落を出さない', () => {
    // PROJECT.companies[0].note は '' なので、note 由来の段落行は現れないはず。
    const md = projectBlockToMarkdown(PROJECT);
    const headingIndex = md.indexOf('### 株式会社テスト — テストシステム開発');
    const tableIndex = md.indexOf('| 項目 | 内容 |');
    // 見出し直後〜表の直前に note 由来の非空行が無い（空行のみ）ことを確認する。
    const between = md
      .slice(headingIndex + '### 株式会社テスト — テストシステム開発'.length, tableIndex)
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(between).toEqual([]);
  });

  // #242: comment は案件1件あたり数百文字の本文で、画面では InlineMarkdown で
  // 描画されているのに PDF・バックアップの出力先が無く丸ごと落ちていた。
  it('comment を本文として出力する', () => {
    const withComment: ProjectBlockData = {
      companies: PROJECT.companies,
      items: [{ ...PROJECT.items[0], comment: '案件コメント本文' }],
    };
    expect(projectBlockToMarkdown(withComment)).toContain('案件コメント本文');
  });

  it('comment が空文字のときは本文段落を出さない', () => {
    const md = projectBlockToMarkdown(PROJECT);
    expect(md).not.toContain('案件コメント本文');
    // 習得スキル節の後ろに空行以外が続かない（comment 由来の段落が無い）。
    const tail = md
      .slice(md.indexOf('習得スキルテスト') + '習得スキルテスト'.length)
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(tail).toEqual([]);
  });

  // #242: duties / acquired / comment はビューア側が InlineMarkdown で描画する
  // markdown フィールド。PDF 側だけ escape していたため `\- ` の羅列になっていた。
  it('duties / acquired / comment の箇条書き・強調を markdown 構造のまま残す', () => {
    const withMarkdown: ProjectBlockData = {
      companies: PROJECT.companies,
      items: [
        {
          ...PROJECT.items[0],
          duties: '- 箇条書き1\n- 箇条書き2',
          acquired: '**強調**',
          comment: '[モバイル]\n- コメント内の箇条書き',
        },
      ],
    };
    const md = projectBlockToMarkdown(withMarkdown);
    expect(md).toContain('- 箇条書き1');
    expect(md).toContain('**強調**');
    expect(md).toContain('- コメント内の箇条書き');
    expect(md).not.toContain('\\-');
    expect(md).not.toContain('\\#');
  });

  // 自由記述の見出しは、PDF 側の案件カード分割（次の heading までを1単位とする走査）を
  // その場で打ち切り、カードをページ境界で割る。ビューアは h1〜h6 を地の文と同じ見た目へ
  // 潰しており構造として扱っていないので、生成する markdown でも見出しにしない。
  it('duties / acquired / comment の見出し記法は本文を残したまま見出しでなくする', () => {
    const withHeading: ProjectBlockData = {
      companies: PROJECT.companies,
      items: [
        {
          ...PROJECT.items[0],
          duties: '### ATX 見出し\n- 箇条書き',
          acquired: 'Setext 見出し\n===\n本文',
          comment: '#### 4段見出し\n段落',
        },
      ],
    };
    const md = projectBlockToMarkdown(withHeading);
    // 本文は残る
    expect(md).toContain('ATX 見出し');
    expect(md).toContain('Setext 見出し');
    expect(md).toContain('4段見出し');
    expect(md).toContain('- 箇条書き');
    // 見出しにはならない（`**業務内容**` 等の構造行と衝突しないよう行単位で見る）
    const lines = md.split('\n');
    expect(lines).not.toContain('### ATX 見出し');
    expect(lines).not.toContain('#### 4段見出し');
    // Setext の下線は直前に空行が入り、段落から切り離される
    expect(md).toContain('Setext 見出し\n\n===');
    // エスケープで潰したのではない（`\#` を出すと画面に `#` が見えてしまう）
    expect(md).not.toContain('\\#');
  });

  // CommonMark では本文の無い `###` 単独行も見出しになる。ここを取りこぼすと、
  // 上のテストが防いでいるカード分割の打ち切りがそのまま起きる。
  it('本文を持たない見出しマーカー単独行も見出しにしない', () => {
    const markerOnly: ProjectBlockData = {
      companies: PROJECT.companies,
      items: [{ ...PROJECT.items[0], comment: '段落\n\n###\n次の段落' }],
    };
    const lines = projectBlockToMarkdown(markerOnly).split('\n');
    expect(lines).not.toContain('###');
    expect(lines).toContain('次の段落');
  });

  // コードフェンスの中身は markdown 構造ではなくコード本体。書き換えると原文が変わる。
  it('コードフェンス内の # 始まりの行は書き換えない', () => {
    const fenced: ProjectBlockData = {
      companies: PROJECT.companies,
      items: [{ ...PROJECT.items[0], comment: '```bash\n# コメント行\nls -la\n```' }],
    };
    const md = projectBlockToMarkdown(fenced);
    expect(md).toContain('# コメント行');
    expect(md).not.toContain('\\# コメント行');
  });

  it('duties / acquired / comment の <script> / <style> は内容ごと落とす', () => {
    const withScript: ProjectBlockData = {
      companies: PROJECT.companies,
      items: [
        {
          ...PROJECT.items[0],
          duties: '前<script>alert(1)</script>後',
          acquired: '前<style>body{}</style>後',
          comment: '前<script src="https://example.com/x.js"></script>後',
        },
      ],
    };
    const md = projectBlockToMarkdown(withScript);
    expect(md).not.toContain('alert(1)');
    expect(md).not.toContain('<script');
    expect(md).not.toContain('<style');
    expect(md).toContain('前後');
  });

  // note だけは画面側（project-card.tsx / project-preview.tsx）が素のテキストとして
  // 描画するため、markdown 構造化しない従来の escape を維持する。
  it('note は markdown 化せず従来どおり escape する（duties などと扱いを分ける）', () => {
    const withBoth: ProjectBlockData = {
      companies: [{ ...PROJECT.companies[0], note: '- note の箇条書き' }],
      items: [{ ...PROJECT.items[0], duties: '- duties の箇条書き' }],
    };
    const md = projectBlockToMarkdown(withBoth);
    expect(md).toContain('\\- note の箇条書き');
    expect(md).toContain('- duties の箇条書き');
  });
});

describe('blocksToMarkdown — 新型ブロック dispatch', () => {
  it('profile ブロックを markdown に変換して連結する', () => {
    const blks: Block[] = [{ id: 'p', type: 'profile', order: 0, data: PROFILE }];
    expect(blocksToMarkdown(blks)).toContain('# テスト太郎');
  });

  it('stats ブロックを markdown に変換して連結する', () => {
    const blks: Block[] = [{ id: 's', type: 'stats', order: 0, data: STATS }];
    expect(blocksToMarkdown(blks)).toContain('エンジニア歴');
  });

  it('project ブロックを markdown に変換して連結する', () => {
    const blks: Block[] = [{ id: 'j', type: 'project', order: 0, data: PROJECT }];
    expect(blocksToMarkdown(blks)).toContain('株式会社テスト');
  });

  it('未知 type のブロックは空文字を返してエラーを throw しない', () => {
    const blks = [{ id: 'x', type: 'unknown', order: 0, data: {} }] as unknown as Block[];
    expect(() => blocksToMarkdown(blks)).not.toThrow();
    expect(blocksToMarkdown(blks)).toBe('');
  });

  it('空配列は空文字を返してエラーを throw しない', () => {
    expect(() => blocksToMarkdown([])).not.toThrow();
    expect(blocksToMarkdown([])).toBe('');
  });
});

// ---- Phase 0: hidden / 期間フィールドのバリデーションと表示フィルタ ----------

describe('バリデータ — optional フィールドの後方互換', () => {
  it('isProfileBlockData: company 欠如は許容、存在するなら string 必須', () => {
    expect(isProfileBlockData(PROFILE)).toBe(true);
    expect(isProfileBlockData({ ...PROFILE, company: '株式会社テスト' })).toBe(true);
    expect(isProfileBlockData({ ...PROFILE, company: 123 })).toBe(false);
  });

  it('isProjectBlockData: hidden / periodStart / periodEnd / ongoing 欠如を許容する（既存データ）', () => {
    expect(isProjectBlockData(PROJECT)).toBe(true);
  });

  it('isProjectBlockData: optional フィールドが正しい型なら受け入れる', () => {
    const data: ProjectBlockData = {
      companies: [{ ...PROJECT.companies[0], hidden: true }],
      items: [{ ...PROJECT.items[0], hidden: false, periodStart: '2020-06', periodEnd: '2021-08', ongoing: true }],
    };
    expect(isProjectBlockData(data)).toBe(true);
  });

  it('isProjectBlockData: 会社の hidden が boolean でなければ拒否', () => {
    expect(isProjectBlockData({ companies: [{ ...PROJECT.companies[0], hidden: 'yes' }], items: [] })).toBe(false);
  });

  it('isProjectBlockData: 案件の hidden / periodStart / ongoing の型違いは拒否', () => {
    expect(isProjectBlockData({ companies: [], items: [{ ...PROJECT.items[0], hidden: 1 }] })).toBe(false);
    expect(isProjectBlockData({ companies: [], items: [{ ...PROJECT.items[0], periodStart: 202006 }] })).toBe(false);
    expect(isProjectBlockData({ companies: [], items: [{ ...PROJECT.items[0], periodEnd: null }] })).toBe(false);
    expect(isProjectBlockData({ companies: [], items: [{ ...PROJECT.items[0], ongoing: 'true' }] })).toBe(false);
  });
});

describe('filterVisibleProjectData', () => {
  const HIDDEN_PROJECT: ProjectBlockData = {
    companies: [
      { id: 'c1', name: '表示会社', kind: '', period: '', note: '' },
      { id: 'c2', name: '非表示会社', kind: '', period: '', note: '', hidden: true },
    ],
    items: [
      { ...PROJECT.items[0], id: 'p1', companyId: 'c1', title: '表示案件' },
      { ...PROJECT.items[0], id: 'p2', companyId: 'c1', title: '非表示案件', hidden: true },
      { ...PROJECT.items[0], id: 'p3', companyId: 'c2', title: '非表示会社配下の案件' },
      { ...PROJECT.items[0], id: 'p4', companyId: 'unknown', title: '会社不明の案件' },
    ],
  };

  it('hidden な案件を除外する', () => {
    const visible = filterVisibleProjectData(HIDDEN_PROJECT);
    expect(visible.items.map((i) => i.id)).not.toContain('p2');
  });

  it('hidden な会社は配下の案件ごと除外する', () => {
    const visible = filterVisibleProjectData(HIDDEN_PROJECT);
    expect(visible.companies.map((c) => c.id)).toEqual(['c1']);
    expect(visible.items.map((i) => i.id)).not.toContain('p3');
  });

  it('companyId が未知（会社未登録）の案件は従来どおり表示する', () => {
    const visible = filterVisibleProjectData(HIDDEN_PROJECT);
    expect(visible.items.map((i) => i.id)).toEqual(['p1', 'p4']);
  });

  it('入力データを破壊しない（非破壊フィルタ）', () => {
    const companiesBefore = [...HIDDEN_PROJECT.companies];
    const itemsBefore = [...HIDDEN_PROJECT.items];
    filterVisibleProjectData(HIDDEN_PROJECT);
    expect(HIDDEN_PROJECT.companies).toEqual(companiesBefore);
    expect(HIDDEN_PROJECT.items).toEqual(itemsBefore);
    expect(HIDDEN_PROJECT.companies).toHaveLength(2);
    expect(HIDDEN_PROJECT.items).toHaveLength(4);
  });

  it('projectBlockToMarkdown も hidden な会社・案件を除外する（PDF パリティ）', () => {
    const md = projectBlockToMarkdown(HIDDEN_PROJECT);
    expect(md).toContain('表示案件');
    expect(md).toContain('会社不明の案件');
    expect(md).not.toContain('非表示案件');
    expect(md).not.toContain('非表示会社配下の案件');
    expect(md).not.toContain('非表示会社 —');
  });

  it('projectBlockToMarkdown は includeHidden:true で hidden な会社・案件も出力する（バックアップ用）', () => {
    const md = projectBlockToMarkdown(HIDDEN_PROJECT, { includeHidden: true });
    expect(md).toContain('表示案件');
    expect(md).toContain('非表示案件');
    expect(md).toContain('非表示会社配下の案件');
    expect(md).toContain('非表示会社 —');
  });
});

describe('A1 (e): blockToItem → itemToBlockInput round-trip', () => {
  it('profile Block → EditorItem → BlockInput でデータが一致する', () => {
    const block: Block = { id: 'b0', type: 'profile', order: 0, data: PROFILE };
    // blockToItem の変換ロジックをインラインで再現（builder-client.tsx と同一）
    const item = { id: 'block-0', type: 'profile' as const, ...block.data };
    // itemToBlockInput の変換ロジックをインラインで再現
    const { name, title, pr, strengths, meta } = item;
    const blockInput: BlockInput = { type: 'profile', data: { name, title, pr, strengths, meta } };
    expect(blockInput.data).toEqual(PROFILE);
  });

  it('stats Block → EditorItem → BlockInput でデータが一致する', () => {
    const block: Block = { id: 'b1', type: 'stats', order: 0, data: STATS };
    const item = { id: 'block-0', type: 'stats' as const, data: block.data };
    const blockInput: BlockInput = { type: 'stats', data: item.data };
    expect(blockInput.data).toEqual(STATS);
  });

  it('project Block → EditorItem → BlockInput でデータが一致する', () => {
    const block: Block = { id: 'b2', type: 'project', order: 0, data: PROJECT };
    const item = { id: 'block-0', type: 'project' as const, data: block.data };
    const blockInput: BlockInput = { type: 'project', data: item.data };
    expect(blockInput.data).toEqual(PROJECT);
  });
});
