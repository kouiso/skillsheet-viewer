import { describe, expect, it, vi } from 'vitest';
import { type Block, blocksToMarkdown, type ProjectItem } from '@/db/blocks';
import { canonicalJson, validateDocumentBlocks } from '@/db/document-contract';
import { assembleMarkdown, blockToItem, itemsToDocumentBlocks, newId } from './serialize';

describe('document editor roundtrip', () => {
  it('preserves UUID, whitespace and optional missing profile fields', () => {
    const raw: Block = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      order: 0,
      type: 'profile',
      data: { name: '合成', title: ' 担当 ', pr: '原文\n', strengths: ['一行', '', '  '], meta: { 任意: '内容' } },
    };
    const result = itemsToDocumentBlocks([blockToItem(raw)]);
    expect(canonicalJson(result)).toBe(canonicalJson([raw]));
    expect(validateDocumentBlocks(result)).toEqual([]);
  });
  it('changes order without changing identity when blocks move', () => {
    const a: Block = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      order: 0,
      type: 'markdown',
      data: { markdown: 'A' },
    };
    const b: Block = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      order: 1,
      type: 'markdown',
      data: { markdown: 'B' },
    };
    const result = itemsToDocumentBlocks([blockToItem(b), blockToItem(a)]);
    expect(result.map(({ id, order }) => [id, order])).toEqual([
      [b.id, 0],
      [a.id, 1],
    ]);
  });
  it('creates RFC UUIDs even without randomUUID support', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it('固定月Markdownは全案件ブロックの重複月を統合し、非表示案件を手入力へ戻さない', () => {
  const project = (id: string, period: string, name: string, hidden = false): ProjectItem => ({
    id,
    period,
    title: id,
    companyId: 'company',
    scope: '',
    role: '',
    team: '',
    tech: { lang: [name], fw: [], db: [], infra: [], tools: [], collab: [] },
    process: [],
    duties: '',
    acquired: '',
    comment: '',
    hidden,
  });
  const blocks: Block[] = [
    {
      id: 's',
      order: 0,
      type: 'skills',
      data: {
        category: '',
        skills: [
          { name: 'TypeScript', years: 9, level: '独立した習熟度' },
          { name: 'Rust', years: 8, level: '' },
          { name: 'Go', years: 2, level: '' },
        ],
      },
    },
    {
      id: 'p1',
      order: 1,
      type: 'project',
      data: {
        companies: [],
        items: [project('a', '2026.01 — 2026.03', 'TypeScript'), project('hidden', '2020.01 — 2026.09', 'Rust', true)],
      },
    },
    {
      id: 'p2',
      order: 2,
      type: 'project',
      data: { companies: [], items: [project('b', '2026.03 — 2026.04', 'TypeScript')] },
    },
  ];
  const original = canonicalJson(blocks);
  const referenceMonth = 2026 * 12 + 8;
  const server = blocksToMarkdown(blocks, referenceMonth);
  expect(assembleMarkdown(blocks.map(blockToItem), { referenceMonth })).toBe(server);
  expect(server).toContain('0年4ヶ月（案件から算出）');
  expect(server).toContain('0年0ヶ月（案件から算出）');
  expect(server).toContain('2年（本人入力）');
  expect(server).toContain('独立した習熟度');
  expect(server).toContain('2026-09基準');
  expect(server).not.toContain('9年');
  expect(server).not.toContain('8年');
  expect(canonicalJson(blocks)).toBe(original);
});

it('固定月Markdownの統計は案件ゼロで古い手入力件数・年数を再利用しない', () => {
  const blocks: Block[] = [
    {
      id: 'stats',
      order: 0,
      type: 'stats',
      data: {
        items: [
          { label: '案件数', value: '99', unit: '件' },
          { label: 'エンジニア歴', value: '30', unit: '年' },
          { label: '資格', value: '2', unit: '件' },
        ],
      },
    },
  ];
  const referenceMonth = 2026 * 12 + 8;
  const server = blocksToMarkdown(blocks, referenceMonth);
  expect(assembleMarkdown(blocks.map(blockToItem), { referenceMonth })).toBe(server);
  expect(server).toContain('| 0件 | 0年 | 2件 |');
  expect(blocks[0].data).toEqual({
    items: [
      { label: '案件数', value: '99', unit: '件' },
      { label: 'エンジニア歴', value: '30', unit: '年' },
      { label: '資格', value: '2', unit: '件' },
    ],
  });
});

it.each([
  NaN,
  Infinity,
  -1,
  24320.5,
  Number.MAX_SAFE_INTEGER + 1,
])('不正な基準月%sを空文書でも黙って受け入れない', (referenceMonth) => {
  expect(() => blocksToMarkdown([], referenceMonth)).toThrow('INVALID_REFERENCE_MONTH');
  expect(() => assembleMarkdown([], { referenceMonth })).toThrow('INVALID_REFERENCE_MONTH');
});
