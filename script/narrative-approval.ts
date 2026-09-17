import type { DocumentSnapshot } from '../src/db/document-service';
import {
  type NarrativeProposal,
  narrativeApprovalChanges,
  verifyNarrativeProposal,
} from './narrative-proposal';
import { persistPrivateRepairRecord } from './repair-proposal-file';

/** 呼出元が本人の明示確認で取得した対象ハッシュを記録する。自動承認は行わない。 */
export function recordNarrativeApproval(
  path: string,
  owner: string,
  current: DocumentSnapshot,
  proposal: NarrativeProposal,
  confirmed: { beforeHash: string; afterHash: string },
) {
  const verified = verifyNarrativeProposal(owner, current, proposal, confirmed);
  const record = {
    version: 1 as const,
    kind: 'narrative-update-approval' as const,
    owner,
    sheetId: current.sheetId,
    expectedRevision: current.revision,
    beforeHash: verified.beforeHash,
    afterHash: verified.afterHash,
    evidenceHash: verified.evidenceHash,
    changes: narrativeApprovalChanges(verified.changes),
  };
  persistPrivateRepairRecord(path, record);
  return record;
}
