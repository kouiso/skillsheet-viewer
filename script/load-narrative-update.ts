import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { canonicalJson, isRevision, validateDocumentBlocks } from '../src/db/document-contract';
import type { DocumentSnapshot } from '../src/db/document-service';
import {
  COMPANY_NARRATIVE_FIELDS,
  narrativeApprovalChanges,
  PROJECT_NARRATIVE_FIELDS,
  verifyNarrativeProposal,
} from './narrative-proposal';
import { readPrivateRepairRecord } from './repair-proposal-file';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const block = z.object({ id: z.guid(), type: z.string(), order: z.number().int(), data: z.unknown() }).strict();
const beforeSchema = z
  .object({
    owner: z.string().min(1),
    snapshot: z
      .object({
        sheetId: z.guid(),
        revision: z.string().refine(isRevision),
        title: z.string(),
        blocks: z.array(block),
        validation: z.unknown(),
      })
      .strict(),
  })
  .strict();
const change = z
  .object({
    blockId: z.guid(),
    targetId: z.guid(),
    targetKind: z.enum(['project', 'company']),
    field: z.string(),
    beforeHash: hash,
    afterHash: hash,
    evidenceHash: hash,
    value: z.string(),
  })
  .strict()
  .refine((entry) =>
    (entry.targetKind === 'project' ? PROJECT_NARRATIVE_FIELDS : COMPANY_NARRATIVE_FIELDS).some(
      (field) => field === entry.field,
    ),
  )
  .refine((entry) => createHash('sha256').update(canonicalJson(entry.value)).digest('hex') === entry.afterHash);
const proposalSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('narrative-update-proposal'),
    approved: z.literal(false),
    owner: z.string().min(1),
    sheetId: z.guid(),
    expectedRevision: z.string().refine(isRevision),
    beforeHash: hash,
    afterHash: hash,
    evidenceHash: hash,
    changes: z.array(change),
    unmatched: z.object({ projects: z.array(z.string()), companies: z.array(z.string()) }).strict(),
    blocks: z.array(block),
    remainingIssues: z.array(z.unknown()),
  })
  .strict();

/** 保存したbeforeから差分を再適用して全文と承認を照合する。現在のDBをbeforeへ昇格させない。 */
export function loadNarrativeUpdate(directory: string, owner: string, sheetId: string) {
  const saved = beforeSchema.parse(readPrivateRepairRecord(join(directory, 'before.json')));
  if (saved.owner !== owner || saved.snapshot.sheetId.toLowerCase() !== sheetId.toLowerCase()) {
    throw new Error('NARRATIVE_TARGET_MISMATCH');
  }
  const blocks = saved.snapshot.blocks.map((entry) => {
    if (!Object.hasOwn(entry, 'data')) throw new Error('INVALID_NARRATIVE_RECORD');
    return { ...entry, data: entry.data };
  });
  const issues = validateDocumentBlocks(blocks);
  const before: DocumentSnapshot = { ...saved.snapshot, blocks, validation: { editable: issues.length === 0, issues } };
  if (canonicalJson(before) !== canonicalJson(saved.snapshot)) throw new Error('INVALID_NARRATIVE_RECORD');
  const candidate = proposalSchema.parse(readPrivateRepairRecord(join(directory, 'proposal.json')));
  if (candidate.remainingIssues.length !== 0) throw new Error('UNRESOLVED_DOCUMENT_ISSUES');
  const proposal = verifyNarrativeProposal(owner, before, { ...candidate, remainingIssues: [] }, candidate);
  if (validateDocumentBlocks(proposal.blocks).length !== 0) throw new Error('UNRESOLVED_DOCUMENT_ISSUES');
  const approval = {
    version: 1 as const,
    kind: 'narrative-update-approval' as const,
    owner,
    sheetId: before.sheetId,
    expectedRevision: before.revision,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
    evidenceHash: proposal.evidenceHash,
    changes: narrativeApprovalChanges(proposal.changes),
  };
  if (canonicalJson(readPrivateRepairRecord(join(directory, 'approved.json'))) !== canonicalJson(approval)) {
    throw new Error('NARRATIVE_APPROVAL_MISMATCH');
  }
  return { before, proposal, approval };
}

export function narrativeAppliedRecord(
  owner: string,
  before: DocumentSnapshot,
  proposal: ReturnType<typeof loadNarrativeUpdate>['proposal'],
) {
  return {
    version: 1,
    kind: 'narrative-update-db-applied',
    owner,
    sheetId: before.sheetId,
    revision: (BigInt(before.revision) + 1n).toString(),
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
    changes: narrativeApprovalChanges(proposal.changes),
  };
}
