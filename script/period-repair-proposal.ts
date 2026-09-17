import { createHash } from 'node:crypto';
import { isBlockInput } from '../src/db/block';
import { canonicalJson, isRevision, validateDocumentBlocks } from '../src/db/document-contract';
import type { DocumentSnapshot } from '../src/db/document-service';
import { parsePeriodToRange } from '../src/db/process';

const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 未承認の修復候補。期間原文・duration・未知項目を変更せず、DBにも書き込まない。 */
export function proposePeriodRepair(owner: string, snapshot: DocumentSnapshot) {
  if (!owner.trim() || !uuid.test(snapshot.sheetId) || !isRevision(snapshot.revision)) {
    throw new Error('INVALID_REPAIR_IDENTITY');
  }
  const before = {
    owner,
    sheetId: snapshot.sheetId,
    revision: snapshot.revision,
    title: snapshot.title,
    blocks: snapshot.blocks,
  };
  const blocks = structuredClone(snapshot.blocks);
  const changes: { blockId: string; projectId: string; field: string; beforeHash: string; afterHash: string }[] = [];
  for (const block of blocks) {
    if (!isBlockInput(block) || block.type !== 'project') continue;
    const ids = new Set<string>();
    for (const item of block.data.items) {
      if (!uuid.test(item.id) || ids.has(item.id.toLowerCase())) throw new Error('INVALID_PROJECT_ID');
      ids.add(item.id.toLowerCase());
      const range = parsePeriodToRange(item.period);
      if (!range) continue;
      for (const [field, value] of [
        ['periodStart', range.start],
        ['periodEnd', range.end],
        ['ongoing', range.ongoing],
      ] as const) {
        if (!Object.hasOwn(item, field) || item[field] === value) continue;
        changes.push({
          blockId: block.id,
          projectId: item.id,
          field,
          beforeHash: hash(item[field]),
          afterHash: hash(value),
        });
        Object.assign(item, { [field]: value });
      }
    }
  }
  return {
    version: 1 as const,
    approved: false as const,
    owner,
    sheetId: snapshot.sheetId,
    expectedRevision: snapshot.revision,
    beforeHash: hash(before),
    afterHash: hash({ ...before, blocks }),
    changes,
    blocks,
    remainingIssues: validateDocumentBlocks(blocks),
  };
}

export type PeriodRepairProposal = ReturnType<typeof proposePeriodRepair>;

/** 承認記録から渡されたハッシュを現在のrawに照合する。承認自体はこの関数では作らない。 */
export function verifyPeriodRepair(
  owner: string,
  current: DocumentSnapshot,
  proposal: PeriodRepairProposal,
  approvedHashes: { beforeHash: string; afterHash: string },
): PeriodRepairProposal {
  const fresh = proposePeriodRepair(owner, current);
  if (canonicalJson(fresh) !== canonicalJson(proposal)) throw new Error('STALE_OR_CHANGED_REPAIR');
  if (approvedHashes.beforeHash !== fresh.beforeHash || approvedHashes.afterHash !== fresh.afterHash) {
    throw new Error('REPAIR_APPROVAL_MISMATCH');
  }
  if (fresh.remainingIssues.length > 0) throw new Error('UNRESOLVED_DOCUMENT_ISSUES');
  if (fresh.changes.length === 0) throw new Error('EMPTY_REPAIR');
  return fresh;
}
