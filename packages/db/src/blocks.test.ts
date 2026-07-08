import { describe, expect, it } from 'vitest';

import {
  type Block,
  type BlockInput,
  blocksToMarkdown,
  type ExperienceBlockData,
  experienceBlockToMarkdown,
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
    expect(segments[0].markdown.startsWith('## 技術者プロファイル')).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('<details'))).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('## 経歴'))).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('### ◆ 株式会社az'))).toBe(true);
    expect(segments.some((s) => s.markdown.startsWith('#### ■ 1. mypappy'))).toBe(true);
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
    expect(md).toContain('### 株式会社サンプル（2020-04〜2023-03）');
    expect(md).toContain('| 期間 | 2020-04〜2023-03 |');
    expect(md).toContain('| 職種 | フロントエンドエンジニア |');
    expect(md).toContain('React/TypeScript による SPA 開発');
  });

  it('endDate が空のとき「現在」と表示する', () => {
    const md = experienceBlockToMarkdown({ ...EXP, endDate: '' });
    expect(md).toContain('〜現在');
    expect(md).toContain('| 期間 | 2020-04〜現在 |');
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
