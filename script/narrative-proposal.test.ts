import { describe, expect, it } from 'vitest';
import type { ProjectBlockData } from '../src/db/block';
import type { DocumentSnapshot } from '../src/db/document-service';
import type { NarrativeFile } from './apply-project-narrative';
import {
  applyNarrativeChanges,
  narrativeApprovalChanges,
  proposeNarrativeUpdate,
  verifyNarrativeProposal,
} from './narrative-proposal';

const sheetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const blockId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const itemId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const snapshot = (data?: Partial<ProjectBlockData>): DocumentSnapshot => ({
  sheetId,
  title: '合成',
  revision: '42',
  validation: { editable: true, issues: [] },
  blocks: [
    {
      id: blockId,
      type: 'project',
      order: 0,
      data: {
        companies: [{ id: companyId, name: '会社A', kind: '自社', period: '2020.04 — ', note: '' }],
        items: [
          {
            id: itemId,
            companyId,
            title: '案件α',
            scope: '',
            period: '2021.01 — 2021.12',
            role: '',
            team: '',
            tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
            process: [],
            duties: '元の担当',
            acquired: '',
            comment: '',
            ...data?.items?.[0],
          },
          ...(data?.items?.slice(1) ?? []),
        ],
        ...data,
      },
    },
  ],
});

const narrative: NarrativeFile = {
  projects: { 案件α: { duties: '新しい担当', comment: '追記' } },
  companies: { 会社A: { note: '会社メモ' } },
};

describe('本文更新の未承認提案', () => {
  it('タイトル一致をUUID+field+hashの差分へ解決し、本文は提案blocksへだけ反映する', () => {
    const source = snapshot();
    const before = JSON.stringify(source);
    const proposal = proposeNarrativeUpdate('owner-a', source, narrative);
    expect(proposal.approved).toBe(false);
    expect(proposal.expectedRevision).toBe('42');
    expect(proposal.changes).toHaveLength(3);
    const duties = proposal.changes.find((c) => c.field === 'duties');
    expect(duties).toMatchObject({ blockId, targetId: itemId, targetKind: 'project', value: '新しい担当' });
    expect(duties?.beforeHash).not.toBe(duties?.afterHash);
    expect(duties?.evidenceHash).toBeTruthy();
    const note = proposal.changes.find((c) => c.field === 'note');
    expect(note).toMatchObject({ targetId: companyId, targetKind: 'company' });
    // 原文スナップショットは変更されない
    expect(JSON.stringify(source)).toBe(before);
    expect(proposal.afterHash).not.toBe(proposal.beforeHash);
  });

  it('同名タイトルが複数あると推測せず失敗する', () => {
    const source = snapshot();
    const data = source.blocks[0].data as ProjectBlockData;
    data.items.push({ ...data.items[0], id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    expect(() => proposeNarrativeUpdate('owner-a', source, narrative)).toThrow('AMBIGUOUS_NARRATIVE_TARGET');
  });

  it('シートに無いキーはunmatchedに残し黙って捨てない', () => {
    const proposal = proposeNarrativeUpdate('owner-a', snapshot(), {
      projects: { 存在しない案件: { role: 'PL' } },
    });
    expect(proposal.unmatched.projects).toEqual(['存在しない案件']);
    expect(proposal.changes).toHaveLength(0);
  });

  it('同じ値への変更は差分に含めない（冪等）', () => {
    const proposal = proposeNarrativeUpdate('owner-a', snapshot(), {
      projects: { 案件α: { duties: '元の担当' } },
    });
    expect(proposal.changes).toHaveLength(0);
  });
});

describe('承認対象と現在文書の照合', () => {
  it('現在の原文と承認hashが一致する提案だけ返す', () => {
    const source = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', source, narrative);
    expect(verifyNarrativeProposal('owner-a', source, proposal, proposal)).toEqual(proposal);
  });

  it('別owner・古い版・改変された案を拒否する', () => {
    const source = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', source, narrative);
    expect(() => verifyNarrativeProposal('owner-b', source, proposal, proposal)).toThrow('STALE_OR_CHANGED_NARRATIVE');
    expect(() => verifyNarrativeProposal('owner-a', { ...source, revision: '43' }, proposal, proposal)).toThrow(
      'STALE_OR_CHANGED_NARRATIVE',
    );
    const changed = structuredClone(proposal);
    (changed.blocks[0].data as ProjectBlockData).items[0].duties = '改ざん';
    expect(() => verifyNarrativeProposal('owner-a', source, changed, proposal)).toThrow('STALE_OR_CHANGED_NARRATIVE');
  });

  it('承認hash不一致を拒否する', () => {
    const source = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', source, narrative);
    expect(() =>
      verifyNarrativeProposal('owner-a', source, proposal, { ...proposal, afterHash: '0'.repeat(64) }),
    ).toThrow('NARRATIVE_APPROVAL_MISMATCH');
  });

  it('提案後に別変更が入るとbeforeがずれて拒否される', () => {
    const source = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', source, narrative);
    const moved = snapshot();
    (moved.blocks[0].data as ProjectBlockData).items[0].duties = '誰かの後続変更';
    expect(() => verifyNarrativeProposal('owner-a', moved, proposal, proposal)).toThrow('STALE_OR_CHANGED_NARRATIVE');
  });
});

describe('changes再適用', () => {
  it('対象の現在値がbeforeHashと違えば後続変更を踏まずに失敗する', () => {
    const source = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', source, narrative);
    const moved = structuredClone(source.blocks);
    (moved[0].data as ProjectBlockData).items[0].duties = '後続変更';
    expect(() => applyNarrativeChanges(moved, proposal.changes)).toThrow('NARRATIVE_TARGET_CHANGED');
  });

  it('対象IDが消えていれば失敗する', () => {
    const source = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', source, narrative);
    const moved = structuredClone(source.blocks);
    (moved[0].data as ProjectBlockData).items = [];
    expect(() => applyNarrativeChanges(moved, proposal.changes)).toThrow('NARRATIVE_TARGET_CHANGED');
  });
});

describe('承認記録の差分', () => {
  it('hash束縛のみ残し本文値を承認レコードに含めない', () => {
    const proposal = proposeNarrativeUpdate('owner-a', snapshot(), narrative);
    const entries = narrativeApprovalChanges(proposal.changes);
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry).not.toHaveProperty('value');
      expect(entry.beforeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
