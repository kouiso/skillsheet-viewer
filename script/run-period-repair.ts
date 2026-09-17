import { join } from 'node:path';
import type { Database } from '../src/db/client';
import { canonicalJson } from '../src/db/document-contract';
import { createDocumentService, type DocumentSnapshot } from '../src/db/document-service';
import { applyPeriodRepair } from './apply-period-repair';
import { recordPeriodRepairApproval } from './period-repair-approval';
import type { PeriodRepairProposal } from './period-repair-proposal';
import { persistPrivateRepairRecord } from './repair-proposal-file';

/** changeごとの既存privateディレクトリを使う。beforeと承認は信頼できる記録から渡す。 */
export async function runPeriodRepair(
  db: Pick<Database, 'execute'>,
  directory: string,
  owner: string,
  before: DocumentSnapshot,
  proposal: PeriodRepairProposal,
  approval: ReturnType<typeof recordPeriodRepairApproval>,
) {
  // DB更新より先に承認と復旧情報を不変・durable化する。別changeとの混用は保存時に拒否。
  const expected = {
    version: 1,
    kind: 'period-projection-repair-approval',
    owner,
    sheetId: before.sheetId,
    expectedRevision: before.revision,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
    changes: proposal.changes,
  };
  if (canonicalJson(approval) !== canonicalJson(expected)) throw new Error('REPAIR_APPROVAL_MISMATCH');
  recordPeriodRepairApproval(join(directory, 'approved.json'), owner, before, proposal, approval);
  persistPrivateRepairRecord(join(directory, 'before.json'), { owner, snapshot: before });
  persistPrivateRepairRecord(join(directory, 'proposal.json'), proposal);

  const service = createDocumentService(db, owner);
  const current = await service.read(before.sheetId);
  if (current.status !== 'OK') throw new Error('REPAIR_RESUME_CONFLICT');
  const sameContent = (snapshot: DocumentSnapshot, blocks: DocumentSnapshot['blocks']) =>
    snapshot.sheetId === before.sheetId &&
    snapshot.title === before.title &&
    canonicalJson(snapshot.blocks) === canonicalJson(blocks);
  let after: DocumentSnapshot;
  if (current.snapshot.revision === before.revision && sameContent(current.snapshot, before.blocks)) {
    after = await applyPeriodRepair(db, owner, proposal, approval);
  } else if (
    BigInt(current.snapshot.revision) === BigInt(before.revision) + 1n &&
    sameContent(current.snapshot, proposal.blocks)
  ) {
    // 応答または完了記録を失った適用。後続の版まで進んでいる場合は推測で成功にしない。
    after = current.snapshot;
  } else {
    throw new Error('REPAIR_RESUME_CONFLICT');
  }
  persistPrivateRepairRecord(join(directory, 'db-applied.json'), {
    version: 1,
    kind: 'period-projection-repair-db-applied',
    owner,
    sheetId: after.sheetId,
    revision: after.revision,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
  });
  return after;
}
