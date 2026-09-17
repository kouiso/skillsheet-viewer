import { sql } from 'drizzle-orm';
import type { Database } from '../src/db/client';
import { canonicalJson } from '../src/db/document-contract';
import { createDocumentService, DocumentError } from '../src/db/document-service';
import type { recordNarrativeApproval } from './narrative-approval';
import {
  type NarrativeProposal,
  narrativeApprovalChanges,
  verifyNarrativeProposal,
} from './narrative-proposal';

/** 承認記録は信頼できるローカル記録から読込むこと。通常保存のeditable制約は変更しない。 */
export async function applyNarrativeUpdate(
  db: Pick<Database, 'execute'>,
  owner: string,
  proposal: NarrativeProposal,
  approval: ReturnType<typeof recordNarrativeApproval>,
) {
  const service = createDocumentService(db, owner);
  const current = await service.read(proposal.sheetId);
  if (current.status !== 'OK') throw new DocumentError(current.status);
  const verified = verifyNarrativeProposal(owner, current.snapshot, proposal, approval);
  const expectedApproval = {
    version: 1,
    kind: 'narrative-update-approval',
    owner,
    sheetId: current.snapshot.sheetId,
    expectedRevision: current.snapshot.revision,
    beforeHash: verified.beforeHash,
    afterHash: verified.afterHash,
    evidenceHash: verified.evidenceHash,
    changes: narrativeApprovalChanges(verified.changes),
  };
  if (canonicalJson(approval) !== canonicalJson(expectedApproval)) throw new Error('NARRATIVE_APPROVAL_MISMATCH');
  // 差分は再生成・全文照合済み。読み取り後の競合はDBの版CASで拒否する。
  const result = await db.execute(sql`select skillsheet_private.replace_sheet(${proposal.sheetId}::uuid,
    ${proposal.expectedRevision}::text, ${current.snapshot.title}::text,
    ${canonicalJson(verified.blocks)}::jsonb, ${owner}::text) as result`);
  const rows = Array.isArray(result) ? result : result.rows;
  const status = (rows[0] as { result?: { status?: string } } | undefined)?.result?.status;
  if (status !== 'OK') throw new Error(status === 'CONFLICT' ? 'CONFLICT' : 'NARRATIVE_WRITE_FAILED');
  const after = await service.read(proposal.sheetId);
  if (
    after.status !== 'OK' ||
    canonicalJson(after.snapshot.blocks) !== canonicalJson(verified.blocks) ||
    after.snapshot.title !== current.snapshot.title ||
    BigInt(after.snapshot.revision) !== BigInt(proposal.expectedRevision) + 1n
  ) {
    throw new Error('NARRATIVE_READBACK_MISMATCH');
  }
  return after.snapshot;
}
