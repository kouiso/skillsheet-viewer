import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { Database } from '../src/db/client';
import { canonicalJson } from '../src/db/document-contract';
import { createDocumentService } from '../src/db/document-service';
import { persistPrivateRepairRecord, readPrivateRepairRecord } from './repair-proposal-file';
import { loadPeriodRepair } from './resume-period-repair';

/** 明示的な取り消し要求専用。今回のafterだけをCASでbeforeへ戻し、後続版を保護する。 */
export async function revertPeriodRepair(db: Pick<Database, 'execute'>, directory: string, owner: string) {
  const { before, proposal } = loadPeriodRepair(directory, owner);
  const appliedRevision = (BigInt(before.revision) + 1n).toString();
  const revertedRevision = (BigInt(before.revision) + 2n).toString();
  const applied = {
    version: 1,
    kind: 'period-projection-repair-db-applied',
    owner,
    sheetId: before.sheetId,
    revision: appliedRevision,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
  };
  if (canonicalJson(readPrivateRepairRecord(join(directory, 'db-applied.json'))) !== canonicalJson(applied)) {
    throw new Error('REPAIR_APPLIED_RECORD_MISMATCH');
  }
  const request = { ...applied, kind: 'period-projection-repair-revert-requested' };
  const service = createDocumentService(db, owner);
  const current = await service.read(before.sheetId);
  if (current.status !== 'OK' || current.snapshot.title !== before.title) throw new Error('REPAIR_REVERT_CONFLICT');
  const snapshot = current.snapshot;
  if (snapshot.revision === revertedRevision && canonicalJson(snapshot.blocks) === canonicalJson(before.blocks)) {
    // 取り消し適用後に完了記録を失った場合のみ再開する。
    if (canonicalJson(readPrivateRepairRecord(join(directory, 'revert-requested.json'))) !== canonicalJson(request)) {
      throw new Error('REPAIR_REVERT_CONFLICT');
    }
  } else {
    if (snapshot.revision !== appliedRevision || canonicalJson(snapshot.blocks) !== canonicalJson(proposal.blocks)) {
      throw new Error('REPAIR_REVERT_CONFLICT');
    }
    persistPrivateRepairRecord(join(directory, 'revert-requested.json'), request);
    const result = await db.execute(sql`select skillsheet_private.replace_sheet(
      ${before.sheetId}::uuid, ${appliedRevision}::text, ${before.title}::text,
      ${canonicalJson(before.blocks)}::jsonb, ${owner}::text) as result`);
    const rows = Array.isArray(result) ? result : result.rows;
    if ((rows[0] as { result?: { status?: string } } | undefined)?.result?.status !== 'OK') {
      throw new Error('REPAIR_REVERT_CONFLICT');
    }
  }
  const after = await service.read(before.sheetId);
  if (
    after.status !== 'OK' ||
    after.snapshot.revision !== revertedRevision ||
    after.snapshot.title !== before.title ||
    canonicalJson(after.snapshot.blocks) !== canonicalJson(before.blocks)
  ) {
    throw new Error('REPAIR_REVERT_READBACK_MISMATCH');
  }
  persistPrivateRepairRecord(join(directory, 'reverted.json'), {
    ...applied,
    kind: 'period-projection-repair-reverted',
    revision: revertedRevision,
  });
  return after.snapshot;
}
