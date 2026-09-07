/**
 * 案件セクションの葉の分解を、要素ツリーではなく「葉の並び・枠・同居指定」で固定する。
 *
 * 以前は project-card-detail.test.ts が `wrap` / `minPresenceAhead` の乗り方を見ていたが、
 * それらは @react-pdf の自動改ページを小突くための指定で、割り付けを自前にした今は存在しない。
 * 同じ意図（見出しだけがページ末尾に残らない・カードの枠が二重に閉じない）を、
 * 葉の `keepWithNext` と `frame` の言葉で見る。描画（renderToBuffer）はしない（CLAUDE.md）。
 */
import { describe, expect, it } from 'vitest';

import type { Leaf, MeasuredLeaf } from './print-leaf';
import { continuationHeadingFor, splitLeaf, toLeaves } from './print-leaves';
import type { PrintCompany, PrintProject, PrintViewModel } from './print-view-model';

function project(overrides: Partial<PrintProject> = {}): PrintProject {
  return {
    id: 'p1',
    index: 1,
    title: '案件タイトル',
    companyName: 'A 社',
    companyLabel: 'A 社',
    periodText: '2025.01〜2025.06',
    compactPeriodText: '2025.01–06',
    durationText: '6ヶ月',
    team: '5 名',
    metaRows: [{ label: '役割', value: 'バックエンド' }],
    techGroups: [{ label: '言語', chips: [{ label: 'TypeScript', emphasis: 'solid' }] }],
    duties: '業務内容の本文。\n\n- 箇条書き 1\n- 箇条書き 2',
    acquired: '',
    comment: 'コメントの本文。',
    compactNote: '',
    level: 'detail',
    ...overrides,
  };
}

function company(projects: PrintProject[], overrides: Partial<PrintCompany> = {}): PrintCompany {
  return {
    id: 'c1',
    name: 'A 社',
    kind: '',
    kindLabel: '',
    periodText: '2025.01〜2025.06',
    note: '会社概要。',
    projectCount: projects.length,
    roles: '',
    teamRange: '',
    isLatest: true,
    projects,
    ...overrides,
  };
}

function vm(companies: PrintCompany[]): PrintViewModel {
  return {
    summary: {
      sheetTitle: 't',
      name: 'n',
      title: '',
      companyName: '',
      stats: [],
      topSkills: [],
      skillEmphasisMode: 'level',
      processLabels: [],
      profileRows: [],
      expertiseRows: [],
      strengths: [],
      pr: '',
    },
    skillGroups: [],
    companies,
    showProjects: true,
    showSkills: true,
    showProcess: true,
    skillEmphasisMode: 'level',
  };
}

describe('toLeaves', () => {
  it('詳細版カードは ヘッダー → メタ表 → チップ分類 → 小見出し + 本文 の順に葉になる', () => {
    const leaves = toLeaves(vm([company([project()])]));
    expect(leaves.map((leaf) => leaf.kind)).toEqual([
      'company-heading',
      'company-note',
      'card-header',
      'meta',
      'tech-group',
      'section-label',
      'paragraph',
      'bullet',
      'bullet',
      'section-label',
      'paragraph',
    ]);
  });

  it('見出し類は次の葉と同居し、本文の葉は同居を要求しない', () => {
    const leaves = toLeaves(vm([company([project()])]));
    const keep = leaves.filter((leaf) => leaf.keepWithNext).map((leaf) => leaf.kind);
    expect(keep).toEqual(['company-heading', 'company-note', 'card-header', 'section-label', 'section-label']);
  });

  it('カードの上辺は先頭の葉、下辺は末尾の葉にだけ付き、最後のブロックには仕切りが無い', () => {
    const leaves = toLeaves(vm([company([project()])]));
    const card = leaves.filter((leaf) => leaf.cardId === 'p1');
    const frames = card.map((leaf) => leaf.frame?.card);
    expect(frames.map((f) => f?.top)).toEqual([true, ...card.slice(1).map(() => false)]);
    expect(frames.map((f) => f?.bottom)).toEqual([...card.slice(0, -1).map(() => false), true]);
    expect(frames[frames.length - 1]?.divider).toBe(false);
    // 仕切りはブロックの末尾の葉にだけ（ヘッダー / メタ表 / チップ / 業務内容の最後の箇条書き）
    const dividers = card.filter((leaf) => leaf.frame?.card?.divider).map((leaf) => leaf.kind);
    expect(dividers).toEqual(['card-header', 'meta', 'tech-group', 'bullet']);
  });

  it('カード同士の間隔は先頭の葉の上、会社の間隔と終端マーカーは会社の最後の葉に付く', () => {
    const leaves = toLeaves(vm([company([project(), project({ id: 'p2', index: 2 })])]));
    const headers = leaves.filter((leaf) => leaf.kind === 'card-header');
    expect(headers.every((leaf) => leaf.frame?.gapAbove === 16)).toBe(true);
    const last = leaves[leaves.length - 1];
    expect(last.frame?.endMarker).toBe(true);
    expect(last.frame?.marginBottom).toBe(20);
    expect(leaves.slice(0, -1).some((leaf) => leaf.frame?.endMarker)).toBe(false);
  });

  it('装飾の無い段落と会社概要だけが行で割れ、箇条書き・太字段落は割れない', () => {
    const leaves = toLeaves(vm([company([project({ comment: '**太字だけの段落**' })])]));
    const splittable = leaves.filter((leaf) => leaf.splittable === 'lines').map((leaf) => leaf.kind);
    expect(splittable).toEqual(['company-note', 'paragraph']);
    expect(leaves.filter((leaf) => leaf.splittable === 'lines').every((leaf) => leaf.text && leaf.remake)).toBe(true);
  });

  it('GFM の表は行ごとの葉になり、見出し行だけが次の行と同居する', () => {
    const table = '| 項目 | 値 |\n| --- | --- |\n| a | 1 |\n| b | 2 |';
    const leaves = toLeaves(vm([company([project({ duties: table, acquired: '', comment: '' })])]));
    const rows = leaves.filter((leaf) => leaf.kind === 'block');
    expect(rows).toHaveLength(3);
    expect(rows.map((leaf) => leaf.keepWithNext)).toEqual([true, false, false]);
    expect(rows.every((leaf) => leaf.splittable === 'never')).toBe(true);
  });

  it('簡約版は列ヘッダー + 行 + 本文の葉になり、同じ表の葉は groupId を共有する', () => {
    const compact = project({ id: 'p3', index: 3, level: 'compact' });
    const leaves = toLeaves(vm([company([compact, { ...compact, id: 'p4', index: 4 }])]));
    const table = leaves.filter((leaf) => leaf.groupId);
    expect(table[0].kind).toBe('compact-header');
    expect(table[0].keepWithNext).toBe(true);
    expect(new Set(table.map((leaf) => leaf.groupId)).size).toBe(1);
    // 案件の下端の罫線は各案件の最後の葉にだけ
    const p3 = table.filter((leaf) => leaf.cardId === 'p3');
    expect(p3.map((leaf) => leaf.frame?.card?.bottom)).toEqual([...p3.slice(0, -1).map(() => false), true]);
  });
});

describe('splitLeaf', () => {
  const measured = (leaf: Leaf): MeasuredLeaf => ({
    ...leaf,
    height: 100,
    marginTop: 0,
    marginBottom: 0,
    lines: [
      { height: 20, string: '一行目。' },
      { height: 20, string: '二行目。' },
      { height: 20, string: '三行目。' },
      { height: 20, string: '四行目。' },
    ],
  });

  it('頭は下辺・仕切り・終端マーカーを持たず、尻は上辺と上の余白を持たない', () => {
    const leaves = toLeaves(
      vm([company([project({ duties: '', acquired: '', comment: '一行目。二行目。三行目。四行目。' })])]),
    );
    const paragraph = leaves.find((leaf) => leaf.kind === 'paragraph');
    if (!paragraph) throw new Error('paragraph leaf missing');
    const source = measured(paragraph);
    // コメントは最後のブロックなので、元の葉は下辺と終端マーカーを持つ
    expect(source.frame?.card?.bottom).toBe(true);
    expect(source.frame?.endMarker).toBe(true);
    const parts = splitLeaf(source, source.lines?.slice(0, 2) ?? [], source.lines?.slice(2) ?? []);
    if (!parts) throw new Error('split failed');
    expect(parts.head.text).toBe('一行目。二行目。');
    expect(parts.tail.text).toBe('三行目。四行目。');
    expect(parts.head.frame?.card?.bottom).toBe(false);
    expect(parts.head.frame?.endMarker).toBe(false);
    expect(parts.head.frame?.marginBottom).toBe(0);
    expect(parts.tail.frame?.card?.bottom).toBe(true);
    expect(parts.tail.frame?.endMarker).toBe(true);
    expect(parts.tail.frame?.card?.padTop).toBe(0);
  });
});

describe('continuationHeadingFor', () => {
  const placed = (leaf: Leaf) => ({ leaf: { ...leaf, height: 1, marginTop: 0, marginBottom: 0 }, top: 0 });
  const page = (leaf: Leaf) => ({ leaves: [placed(leaf)], usedHeight: 1 });

  it('先頭ページには出さず、会社の途中なら会社名、詳細版カードの途中なら案件名も添える', () => {
    const leaves = toLeaves(vm([company([project()])]));
    const heading = leaves.find((leaf) => leaf.kind === 'company-heading');
    const header = leaves.find((leaf) => leaf.kind === 'card-header');
    const paragraph = leaves.find((leaf) => leaf.kind === 'paragraph');
    if (!heading || !header || !paragraph) throw new Error('leaf missing');
    expect(continuationHeadingFor(page(paragraph), 0)).toBe('');
    expect(continuationHeadingFor(page(heading), 1)).toBe('');
    expect(continuationHeadingFor(page(header), 1)).toContain('A 社');
    expect(continuationHeadingFor(page(header), 1)).not.toContain('案件タイトル');
    expect(continuationHeadingFor(page(paragraph), 1)).toContain('案件タイトル（続き）');
  });
});
