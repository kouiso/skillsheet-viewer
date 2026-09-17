import { join } from 'node:path';
import { z } from 'zod';
import type { Database } from '../src/db/client';
import { canonicalJson, isRevision, validateDocumentBlocks } from '../src/db/document-contract';
import { proposePeriodRepair, verifyPeriodRepair } from './period-repair-proposal';
import { readPrivateRepairRecord } from './repair-proposal-file';
import { runPeriodRepair } from './run-period-repair';

const beforeSchema = z
  .object({
    owner: z.string().min(1),
    snapshot: z
      .object({
        sheetId: z.string().uuid(),
        revision: z.string().refine(isRevision),
        title: z.string(),
        blocks: z.array(
          z
            .object({
              id: z.string().uuid(),
              type: z.string(),
              order: z.number().int(),
              data: z.unknown(),
            })
            .strict(),
        ),
        validation: z.unknown(),
      })
      .strict(),
  })
  .strict();

/** 保存済み記録から再開する。本人承認を新規生成せず、再生成した候補との完全一致を必須にする。 */
export function loadPeriodRepair(directory: string, owner: string) {
  const saved = beforeSchema.parse(readPrivateRepairRecord(join(directory, 'before.json')));
  if (saved.owner !== owner) throw new Error('REPAIR_OWNER_MISMATCH');
  // 診断は記録を信用せずrawから再計算する。
  const blocks = saved.snapshot.blocks.map((block) => {
    if (!Object.hasOwn(block, 'data')) throw new Error('INVALID_REPAIR_RECORD');
    return { id: block.id, type: block.type, order: block.order, data: block.data };
  });
  const issues = validateDocumentBlocks(blocks);
  const before = { ...saved.snapshot, blocks, validation: { editable: issues.length === 0, issues } };
  if (canonicalJson(before) !== canonicalJson(saved.snapshot)) throw new Error('INVALID_REPAIR_RECORD');
  const proposal = proposePeriodRepair(owner, before);
  if (canonicalJson(readPrivateRepairRecord(join(directory, 'proposal.json'))) !== canonicalJson(proposal)) {
    throw new Error('STALE_OR_CHANGED_REPAIR');
  }
  const approval = {
    version: 1 as const,
    kind: 'period-projection-repair-approval' as const,
    owner,
    sheetId: before.sheetId,
    expectedRevision: before.revision,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
    changes: proposal.changes,
  };
  if (canonicalJson(readPrivateRepairRecord(join(directory, 'approved.json'))) !== canonicalJson(approval)) {
    throw new Error('REPAIR_APPROVAL_MISMATCH');
  }
  verifyPeriodRepair(owner, before, proposal, approval);
  return { before, proposal, approval };
}

export async function resumePeriodRepair(db: Pick<Database, 'execute'>, directory: string, owner: string) {
  const { before, proposal, approval } = loadPeriodRepair(directory, owner);
  return runPeriodRepair(db, directory, owner, before, proposal, approval);
}
