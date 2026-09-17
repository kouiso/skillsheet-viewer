import { describe, expect, it, vi } from 'vitest';
import type { ProjectBlockData } from '../src/db/block';
import type { Database } from '../src/db/client';
import type { DocumentSnapshot } from '../src/db/document-service';
import type { NarrativeFile } from './apply-project-narrative';
import { applyNarrativeUpdate } from './apply-narrative';
import { recordNarrativeApproval } from './narrative-approval';
import { proposeNarrativeUpdate } from './narrative-proposal';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sheetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const blockId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const itemId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const data: ProjectBlockData = {
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
    },
  ],
};
const snapshot = (revision = '42', blocks = [{ id: blockId, type: 'project', order: 0, data }]): DocumentSnapshot => ({
  sheetId, title: '合成', revision, blocks, validation: { editable: true, issues: [] },
});
const narrative: NarrativeFile = { projects: { 案件α: { duties: '新しい担当' } } };

function approvalFor(owner: string, current: DocumentSnapshot, proposal: ReturnType<typeof proposeNarrativeUpdate>) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'nap-')), 'approved.json');
  return recordNarrativeApproval(file, owner, current, proposal, proposal);
}

function db(...responses: unknown[]) {
  const execute = vi.fn();
  for (const result of responses) execute.mockResolvedValueOnce({ rows: [{ result }] });
  return { execute: execute as unknown as Database['execute'] };
}
const ok = (rev: string, blocks: unknown) => ({ status: 'OK', snapshot: { sheetId, title: '合成', revision: rev, blocks } });

describe('applyNarrativeUpdate', () => {
  it('承認一致+現在文書一致ならCAS→読戻しで新snapshotを返す', async () => {
    const current = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', current, narrative);
    const approval = approvalFor('owner-a', current, proposal);
    const afterBlocks = proposal.blocks;
    const fake = db(
      ok('42', current.blocks),                    // service.read (current)
      ok('43', afterBlocks),                       // replace_sheet → saved() のreadResult
      ok('43', afterBlocks),                       // service.read (readback)
    );
    const result = await applyNarrativeUpdate(fake, 'owner-a', proposal, approval);
    expect(result.revision).toBe('43');
    expect(fake.execute).toHaveBeenCalledTimes(3);
  });

  it('承認記録が案と不一致ならDBを書かず拒否する', async () => {
    const current = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', current, narrative);
    const approval = { ...approvalFor('owner-a', current, proposal), afterHash: '0'.repeat(64) };
    const fake = db(ok('42', current.blocks));
    await expect(applyNarrativeUpdate(fake, 'owner-a', proposal, approval as never)).rejects.toThrow(
      'NARRATIVE_APPROVAL_MISMATCH',
    );
    expect(fake.execute).toHaveBeenCalledTimes(1); // readのみ、書込みなし
  });

  it('CASがCONFLICTを返せばそのまま失敗する', async () => {
    const current = snapshot();
    const proposal = proposeNarrativeUpdate('owner-a', current, narrative);
    const approval = approvalFor('owner-a', current, proposal);
    const fake = db(ok('42', current.blocks), { status: 'CONFLICT' });
    await expect(applyNarrativeUpdate(fake, 'owner-a', proposal, approval)).rejects.toThrow('CONFLICT');
  });
});
