import { describe, expect, it } from 'vitest';
import { canonicalJson, isRevision, type RawDocumentBlock, validateDocumentBlocks } from './document-contract';

const block = (data: unknown, type = 'markdown'): RawDocumentBlock => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type,
  order: 0,
  data,
});

describe('document JSON fidelity', () => {
  it('ignores only object key order and JSON numeric spelling', () => {
    expect(canonicalJson({ b: [1, -0], a: null })).toBe(canonicalJson({ a: null, b: [1.0, 0] }));
    expect(canonicalJson({})).not.toBe(canonicalJson({ a: null }));
    expect(canonicalJson(['a', 'b'])).not.toBe(canonicalJson(['b', 'a']));
    expect(canonicalJson('Ａ')).not.toBe(canonicalJson('A'));
    expect(canonicalJson(' a ')).not.toBe(canonicalJson('a'));
  });
  it('rejects data JSON would silently drop or transform', () => {
    for (const value of [{ a: undefined }, [undefined], new Array(1), NaN, Infinity, 1n, new Date()]) {
      expect(() => canonicalJson(value)).toThrow('INVALID_JSON');
    }
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => canonicalJson(cyclic)).toThrow('INVALID_JSON');
  });
  it('accepts zero and exact bigint strings, rejects number transport and overflow', () => {
    for (const value of ['0', '9007199254740993', '9223372036854775807']) expect(isRevision(value)).toBe(true);
    for (const value of [0, 1, '-1', '01', '1.0', ' 1', '9223372036854775808']) expect(isRevision(value)).toBe(false);
  });
});

describe('raw block validation', () => {
  it('preserves raw unknown fields and reports their exact path', () => {
    const raw = block({ markdown: '原文', extra: { original: null } });
    const before = canonicalJson(raw);
    expect(validateDocumentBlocks([raw])).toEqual([{ blockId: raw.id, path: 'data.extra', code: 'UNKNOWN_FIELD' }]);
    expect(canonicalJson(raw)).toBe(before);
  });
  it('detects nested unknown fields', () => {
    const raw = block(
      { category: '技術', skills: [{ name: 'SQL', years: 1, level: '経験あり', extra: true }] },
      'skills',
    );
    expect(validateDocumentBlocks([raw])).toContainEqual({
      blockId: raw.id,
      path: 'data.skills[0].extra',
      code: 'UNKNOWN_FIELD',
    });
  });
  it('allows arbitrary profile meta labels supported by the editor', () => {
    expect(
      validateDocumentBlocks([
        block({ name: '合成', title: '', pr: '', strengths: [], meta: { 任意: '保持' } }, 'profile'),
      ]),
    ).toEqual([]);
  });
  it('rejects unknown type and ragged tables without changing either', () => {
    expect(validateDocumentBlocks([block({ text: '保持' }, 'future')])[0].code).toBe('INVALID_DATA');
    const raw = block({ columns: [{ label: '列', align: 'left' }], rows: [['保持', '消さない']] }, 'table');
    const before = canonicalJson(raw);
    expect(validateDocumentBlocks([raw])[0].path).toBe('data.rows');
    expect(canonicalJson(raw)).toBe(before);
  });
  it('rejects duplicate IDs and noncontiguous order', () => {
    const raw = block({ markdown: '' });
    expect(validateDocumentBlocks([raw, raw]).map((issue) => issue.code)).toEqual(['INVALID_ID', 'INVALID_ORDER']);
  });
});

describe('期間原文と編集投影', () => {
  const project = {
    id: 'p1',
    companyId: 'c1',
    title: '案件',
    scope: '',
    period: '2026.08 — ',
    role: '',
    team: '',
    tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
    process: [],
    duties: '',
    acquired: '',
    comment: '',
  };
  it('終了未記載を継続投影で上書きさせず、原文を保持する', () => {
    const raw = block({ companies: [], items: [{ ...project, ongoing: true }] }, 'project');
    const before = canonicalJson(raw);
    expect(validateDocumentBlocks([raw])).toContainEqual({
      blockId: raw.id,
      path: 'data.items[0].ongoing',
      code: 'PERIOD_PROJECTION_MISMATCH',
    });
    expect(canonicalJson(raw)).toBe(before);
  });
  it('投影未存在と原文に一致する投影は受け入れる', () => {
    for (const item of [project, { ...project, periodStart: '2026-08', periodEnd: '', ongoing: false }]) {
      expect(validateDocumentBlocks([block({ companies: [], items: [item] }, 'project')])).toEqual([]);
    }
  });
  it('原文とは異なる開始月を拒否する', () => {
    const raw = block({ companies: [], items: [{ ...project, periodStart: '2026-09' }] }, 'project');
    expect(validateDocumentBlocks([raw]).map((issue) => issue.path)).toContain('data.items[0].periodStart');
  });
});
