import type { DocumentSnapshot } from '../src/db/document-service';
import { type PeriodRepairProposal, verifyPeriodRepair } from './period-repair-proposal';
import { persistPrivateRepairRecord } from './repair-proposal-file';

/** 呼出元が本人の明示確認で取得した対象ハッシュを記録する。自動承認は行わない。 */
export function recordPeriodRepairApproval(
  path: string,
  owner: string,
  current: DocumentSnapshot,
  proposal: PeriodRepairProposal,
  confirmed: { beforeHash: string; afterHash: string },
) {
  const verified = verifyPeriodRepair(owner, current, proposal, confirmed);
  const record = {
    version: 1 as const,
    kind: 'period-projection-repair-approval' as const,
    owner,
    sheetId: current.sheetId,
    expectedRevision: current.revision,
    beforeHash: verified.beforeHash,
    afterHash: verified.afterHash,
    changes: verified.changes,
  };
  persistPrivateRepairRecord(path, record);
  return record;
}
