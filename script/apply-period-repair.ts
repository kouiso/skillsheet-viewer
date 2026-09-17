import { sql } from 'drizzle-orm';
import type { Database } from '../src/db/client';
import { canonicalJson } from '../src/db/document-contract';
import { createDocumentService, DocumentError } from '../src/db/document-service';
import type { recordPeriodRepairApproval } from './period-repair-approval';
import { type PeriodRepairProposal, verifyPeriodRepair } from './period-repair-proposal';

/** 承認記録は信頼できるローカル記録から読込むこと。通常保存のeditable制約は変更しない。 */
export async function applyPeriodRepair(
  db: Pick<Database, 'execute'>,
  owner: string,
  proposal: PeriodRepairProposal,
  approval: ReturnType<typeof recordPeriodRepairApproval>,
) {
  const service = createDocumentService(db, owner);
  const current = await service.read(proposal.sheetId);
  if (current.status !== 'OK') throw new DocumentError(current.status);
  const verified = verifyPeriodRepair(owner, current.snapshot, proposal, approval);
  const expectedApproval = {
    version: 1,
    kind: 'period-projection-repair-approval',
    owner,
    sheetId: current.snapshot.sheetId,
    expectedRevision: current.snapshot.revision,
    beforeHash: verified.beforeHash,
    afterHash: verified.afterHash,
    changes: verified.changes,
  };
  if (canonicalJson(approval) !== canonicalJson(expectedApproval)) throw new Error('REPAIR_APPROVAL_MISMATCH');
  // 差分は再生成・全文照合済み。読み取り後の競合はDBの版CASで拒否する。
  const result = await db.execute(sql`select skillsheet_private.replace_sheet(${proposal.sheetId}::uuid,
    ${proposal.expectedRevision}::text, ${current.snapshot.title}::text,
    ${canonicalJson(verified.blocks)}::jsonb, ${owner}::text) as result`);
  const rows = Array.isArray(result) ? result : result.rows;
  const status = (rows[0] as { result?: { status?: string } } | undefined)?.result?.status;
  if (status !== 'OK') throw new Error(status === 'CONFLICT' ? 'CONFLICT' : 'REPAIR_WRITE_FAILED');
  const after = await service.read(proposal.sheetId);
  if (
    after.status !== 'OK' ||
    canonicalJson(after.snapshot.blocks) !== canonicalJson(verified.blocks) ||
    after.snapshot.title !== current.snapshot.title ||
    BigInt(after.snapshot.revision) !== BigInt(proposal.expectedRevision) + 1n
  ) {
    throw new Error('REPAIR_READBACK_MISMATCH');
  }
  return after.snapshot;
}
