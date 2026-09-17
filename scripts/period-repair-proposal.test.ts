import { describe, expect, it } from 'vitest';
import type { DocumentSnapshot } from '../src/db/document-service';
import { proposePeriodRepair, verifyPeriodRepair } from './period-repair-proposal';

const snapshot = (): DocumentSnapshot => ({
  sheetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: '合成',
  revision: '9007199254740993',
  validation: { editable: true, issues: [] },
  blocks: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      type: 'project',
      order: 0,
      data: {
        companies: [],
        items: [
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            companyId: 'c',
            title: '案件',
            scope: '',
            period: '2026.08 — ',
            ongoing: true,
            duration: '本人原文',
            extra: { raw: null },
            role: '',
            team: '',
            tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
            process: [],
            duties: '',
            acquired: '',
            comment: '',
          },
        ],
      },
    },
  ],
});

describe('期間投影の未承認修復案', () => {
  it('既存投影だけを修正し原文と未知項目を保持する', () => {
    const source = snapshot();
    const before = JSON.stringify(source);
    const proposal = proposePeriodRepair('owner-a', source);
    expect(proposal.approved).toBe(false);
    expect(proposal.expectedRevision).toBe('9007199254740993');
    expect(proposal.changes.map((change) => change.field)).toEqual(['ongoing']);
    expect(proposal.blocks[0].data).toMatchObject({
      items: [{ period: '2026.08 — ', ongoing: false, duration: '本人原文', extra: { raw: null } }],
    });
    expect(proposal.remainingIssues.some((issue) => issue.code === 'UNKNOWN_FIELD')).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    expect(proposal.afterHash).not.toBe(proposal.beforeHash);
  });
  it('ownerと版が違えば変更前ハッシュも変わる', () => {
    const source = snapshot();
    const original = proposePeriodRepair('owner-a', source).beforeHash;
    expect(proposePeriodRepair('owner-b', source).beforeHash).not.toBe(original);
    source.revision = '9007199254740994';
    expect(proposePeriodRepair('owner-a', source).beforeHash).not.toBe(original);
  });
});

describe('承認対象と現在文書の照合', () => {
  function clean() {
    const source = snapshot();
    const data = source.blocks[0].data as { items: Record<string, unknown>[] };
    delete data.items[0].extra;
    return source;
  }
  it('現在の原文と承認ハッシュが一致する修復案だけ返す', () => {
    const source = clean();
    const proposal = proposePeriodRepair('owner-a', source);
    expect(verifyPeriodRepair('owner-a', source, proposal, proposal)).toEqual(proposal);
  });
  it('古い版・別owner・改変された案を拒否する', () => {
    const source = clean();
    const proposal = proposePeriodRepair('owner-a', source);
    expect(() => verifyPeriodRepair('owner-b', source, proposal, proposal)).toThrow('STALE_OR_CHANGED_REPAIR');
    expect(() =>
      verifyPeriodRepair('owner-a', { ...source, revision: '9007199254740994' }, proposal, proposal),
    ).toThrow('STALE_OR_CHANGED_REPAIR');
    const changed = structuredClone(proposal);
    changed.blocks[0].data = {};
    expect(() => verifyPeriodRepair('owner-a', source, changed, proposal)).toThrow('STALE_OR_CHANGED_REPAIR');
  });
  it('承認ハッシュ不一致と残存する未知項目を拒否する', () => {
    const source = clean();
    const proposal = proposePeriodRepair('owner-a', source);
    expect(() => verifyPeriodRepair('owner-a', source, proposal, { ...proposal, afterHash: 'wrong' })).toThrow(
      'REPAIR_APPROVAL_MISMATCH',
    );
    const unknown = snapshot();
    const candidate = proposePeriodRepair('owner-a', unknown);
    expect(() => verifyPeriodRepair('owner-a', unknown, candidate, candidate)).toThrow('UNRESOLVED_DOCUMENT_ISSUES');
  });
});
