import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { DocumentSnapshot } from '../src/db/document-service';
import { recordPeriodRepairApproval } from './period-repair-approval';
import { proposePeriodRepair } from './period-repair-proposal';

it('明示ハッシュが一致する承認だけを不変記録として保存する', () => {
  const directory = mkdtempSync(join(tmpdir(), 'repair-approval-'));
  try {
    const source: DocumentSnapshot = {
      sheetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      revision: '7',
      title: '合成',
      validation: { editable: false, issues: [] },
      blocks: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          order: 0,
          type: 'project',
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
                role: '',
                team: '',
                process: [],
                duties: '',
                acquired: '',
                comment: '',
                tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
              },
            ],
          },
        },
      ],
    };
    const proposal = proposePeriodRepair('owner-a', source);
    const path = join(directory, 'approval.json');
    expect(() =>
      recordPeriodRepairApproval(path, 'owner-a', source, proposal, { ...proposal, afterHash: 'wrong' }),
    ).toThrow('REPAIR_APPROVAL_MISMATCH');
    expect(existsSync(path)).toBe(false);
    const record = recordPeriodRepairApproval(path, 'owner-a', source, proposal, proposal);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(record);
    expect(recordPeriodRepairApproval(path, 'owner-a', source, proposal, proposal)).toEqual(record);
    const next = { ...source, revision: '8' };
    const nextProposal = proposePeriodRepair('owner-a', next);
    expect(() => recordPeriodRepairApproval(path, 'owner-a', next, nextProposal, nextProposal)).toThrow(
      'PROPOSAL_FILE_CONFLICT',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
