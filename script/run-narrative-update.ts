/**
 * 本人文章更新の orchestration。期間修復と同じ順序:
 *   prepare  … 現在snapshotから更新案を作り私有journalへ固定（DBには書かない）
 *   approve  … 本人が確認したbefore/after hashを承認記録として固定
 *   apply    … 承認・復旧情報をdurable化してからDB CAS→読戻し、journalへ記録
 *   revert   … 今回のafterと一致する時だけbeforeへCAS（revisionは増やす）
 *
 * 接続情報は明示環境変数のみ。暗黙の.env読込・既定シート選択・無承認の書込はしない。
 */
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { createDb, type Database } from '../src/db/client';
import { canonicalJson } from '../src/db/document-contract';
import { createDocumentService, type DocumentSnapshot } from '../src/db/document-service';
import { applyNarrativeUpdate } from './apply-narrative';
import { readNarrative } from './apply-project-narrative';
import { recordNarrativeApproval } from './narrative-approval';
import { appendNarrativeJournal, type NarrativeJournalEntry, narrativeChangeId } from './narrative-journal';
import {
  type NarrativeProposal,
  narrativeApprovalChanges,
  proposeNarrativeUpdate,
  verifyNarrativeProposal,
} from './narrative-proposal';
import { persistPrivateRepairRecord, readPrivateRepairRecord } from './repair-proposal-file';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOURNAL = 'journal.jsonl';

export function parseNarrativeArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !['--action', '--journal', '--owner', '--sheet-id', '--narrative', '--before-hash', '--after-hash'].includes(
        key,
      ) ||
      !value ||
      value.startsWith('--') ||
      values.has(key)
    )
      throw new Error('INVALID_NARRATIVE_ARGUMENTS');
    values.set(key, value);
  }
  const action = values.get('--action');
  const directory = values.get('--journal');
  const owner = values.get('--owner');
  const sheetId = values.get('--sheet-id');
  const narrativePath = values.get('--narrative');
  if (
    !['prepare', 'approve', 'apply', 'revert'].includes(action ?? '') ||
    !directory ||
    !isAbsolute(directory) ||
    !owner?.trim() ||
    owner !== owner.trim() ||
    !sheetId ||
    !uuid.test(sheetId)
  ) {
    throw new Error('EXPLICIT_NARRATIVE_TARGET_REQUIRED');
  }
  const beforeHash = values.get('--before-hash');
  const afterHash = values.get('--after-hash');
  if (action === 'prepare') {
    if (!narrativePath || !isAbsolute(narrativePath)) throw new Error('ABSOLUTE_NARRATIVE_PATH_REQUIRED');
  }
  if (action === 'approve') {
    if (!beforeHash || !/^[0-9a-f]{64}$/.test(beforeHash) || !afterHash || !/^[0-9a-f]{64}$/.test(afterHash)) {
      throw new Error('EXPLICIT_APPROVAL_REQUIRED');
    }
  }
  return {
    action: action as 'prepare' | 'approve' | 'apply' | 'revert',
    directory,
    owner,
    sheetId,
    narrativePath,
    confirmed: beforeHash && afterHash ? { beforeHash, afterHash } : undefined,
  };
}

function journalEntry(
  state: NarrativeJournalEntry['state'],
  owner: string,
  proposal: NarrativeProposal,
  at = new Date().toISOString(),
): NarrativeJournalEntry {
  return {
    version: 1,
    state,
    owner,
    sheetId: proposal.sheetId,
    expectedRevision: proposal.expectedRevision,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
    changeIds: proposal.changes.map(narrativeChangeId),
    at,
  };
}

async function prepareNarrative(
  reader: Pick<ReturnType<typeof createDocumentService>, 'read'>,
  owner: string,
  sheetId: string,
  narrativePath: string,
  directory: string,
) {
  const narrative = readNarrative(narrativePath);
  const result = await reader.read(sheetId);
  if (result.status !== 'OK') throw new Error('DOCUMENT_UNAVAILABLE');
  if (result.snapshot.sheetId.toLowerCase() !== sheetId.toLowerCase()) throw new Error('SNAPSHOT_ID_MISMATCH');
  const proposal = proposeNarrativeUpdate(owner, result.snapshot, narrative);
  persistPrivateRepairRecord(join(directory, 'proposal.json'), proposal);
  return {
    approved: false,
    changes: proposal.changes.length,
    unmatched: proposal.unmatched,
    remainingIssues: proposal.remainingIssues.length,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
  };
}

async function approveNarrative(
  reader: Pick<ReturnType<typeof createDocumentService>, 'read'>,
  owner: string,
  sheetId: string,
  directory: string,
  confirmed: { beforeHash: string; afterHash: string },
) {
  const candidate = readPrivateRepairRecord(join(directory, 'proposal.json')) as NarrativeProposal;
  const current = await reader.read(sheetId);
  if (current.status !== 'OK' || current.snapshot.sheetId.toLowerCase() !== sheetId.toLowerCase()) {
    throw new Error('DOCUMENT_UNAVAILABLE');
  }
  // 承認時点で案が現在文書と完全に一致しなければstaleとして拒否する。
  const proposal = verifyNarrativeProposal(owner, current.snapshot, candidate, confirmed);
  persistPrivateRepairRecord(join(directory, 'before.json'), { owner, snapshot: current.snapshot });
  const approval = recordNarrativeApproval(
    join(directory, 'approved.json'),
    owner,
    current.snapshot,
    proposal,
    confirmed,
  );
  appendNarrativeJournal(join(directory, JOURNAL), journalEntry('approved', owner, proposal));
  return approval;
}

async function applyNarrative(db: Pick<Database, 'execute'>, owner: string, directory: string, sheetId: string) {
  const proposal = readPrivateRepairRecord(join(directory, 'proposal.json')) as NarrativeProposal;
  const approval = readPrivateRepairRecord(join(directory, 'approved.json')) as ReturnType<
    typeof recordNarrativeApproval
  >;
  if (proposal.sheetId.toLowerCase() !== sheetId.toLowerCase()) throw new Error('NARRATIVE_TARGET_MISMATCH');
  const service = createDocumentService(db, owner);
  const current = await service.read(sheetId);
  if (current.status !== 'OK') throw new Error('DOCUMENT_UNAVAILABLE');
  // DB更新より先に承認と復旧情報をdurable化する。
  persistPrivateRepairRecord(join(directory, 'before.json'), { owner, snapshot: current.snapshot });
  const after = await applyNarrativeUpdate(db, owner, proposal, approval);
  // CASと読戻しが成功してから記録する。書込み前に記録すると未適用を適用済みに見せる。
  persistPrivateRepairRecord(join(directory, 'db-applied.json'), {
    version: 1,
    kind: 'narrative-update-db-applied',
    owner,
    sheetId: proposal.sheetId,
    revision: after.revision,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
    changes: narrativeApprovalChanges(proposal.changes),
  });
  appendNarrativeJournal(join(directory, JOURNAL), journalEntry('db-applied', owner, proposal));
  // DB→Markdownの順序契約: DB適用が済んだ時点でMarkdown側はまだ未反映。
  appendNarrativeJournal(join(directory, JOURNAL), journalEntry('sync-pending', owner, proposal));
  return { sheetId: after.sheetId, revision: after.revision };
}

async function revertNarrative(db: Pick<Database, 'execute'>, owner: string, directory: string, sheetId: string) {
  const beforeRecord = readPrivateRepairRecord(join(directory, 'before.json')) as {
    owner: string;
    snapshot: DocumentSnapshot;
  };
  const applied = readPrivateRepairRecord(join(directory, 'db-applied.json')) as {
    revision: string;
    beforeHash: string;
    afterHash: string;
  };
  const proposal = readPrivateRepairRecord(join(directory, 'proposal.json')) as NarrativeProposal;
  if (beforeRecord.owner !== owner || beforeRecord.snapshot.sheetId.toLowerCase() !== sheetId.toLowerCase()) {
    throw new Error('NARRATIVE_REVERT_CONFLICT');
  }
  const service = createDocumentService(db, owner);
  const current = await service.read(sheetId);
  if (current.status !== 'OK') throw new Error('NARRATIVE_REVERT_CONFLICT');
  const snapshot = current.snapshot;
  const appliedRevision = applied.revision;
  if (snapshot.revision !== appliedRevision || canonicalJson(snapshot.blocks) !== canonicalJson(proposal.blocks)) {
    throw new Error('NARRATIVE_REVERT_CONFLICT');
  }
  const result = await db.execute(sql`select skillsheet_private.replace_sheet(
    ${sheetId}::uuid, ${appliedRevision}::text, ${snapshot.title}::text,
    ${canonicalJson(beforeRecord.snapshot.blocks)}::jsonb, ${owner}::text) as result`);
  const rows = Array.isArray(result) ? result : result.rows;
  if ((rows[0] as { result?: { status?: string } } | undefined)?.result?.status !== 'OK') {
    throw new Error('NARRATIVE_REVERT_CONFLICT');
  }
  const after = await service.read(sheetId);
  if (after.status !== 'OK' || canonicalJson(after.snapshot.blocks) !== canonicalJson(beforeRecord.snapshot.blocks)) {
    throw new Error('NARRATIVE_REVERT_READBACK_MISMATCH');
  }
  appendNarrativeJournal(join(directory, JOURNAL), journalEntry('reverted', owner, proposal));
  persistPrivateRepairRecord(join(directory, 'reverted.json'), {
    version: 1,
    kind: 'narrative-update-reverted',
    owner,
    sheetId,
    revision: after.snapshot.revision,
    beforeHash: applied.beforeHash,
    afterHash: applied.afterHash,
  });
  return { sheetId, revision: after.snapshot.revision };
}

/** .envを読まず、明示接続先へだけ接続する。 */
export async function executeNarrativeCommand(args: string[], databaseUrl: string | undefined) {
  const parsed = parseNarrativeArgs(args);
  const { action, directory, owner, sheetId } = parsed;
  if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
  const db = createDb(databaseUrl);
  try {
    if (action === 'prepare') {
      const { narrativePath } = parsed;
      if (!narrativePath) throw new Error('ABSOLUTE_NARRATIVE_PATH_REQUIRED');
      return await prepareNarrative(createDocumentService(db, owner), owner, sheetId, narrativePath, directory);
    }
    if (action === 'approve') {
      const { confirmed } = parsed;
      if (!confirmed) throw new Error('EXPLICIT_APPROVAL_REQUIRED');
      const approval = await approveNarrative(createDocumentService(db, owner), owner, sheetId, directory, confirmed);
      return { approved: true, sheetId: approval.sheetId, revision: approval.expectedRevision };
    }
    if (action === 'apply') return await applyNarrative(db, owner, directory, sheetId);
    return await revertNarrative(db, owner, directory, sheetId);
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executeNarrativeCommand(process.argv.slice(2), process.env.DATABASE_URL)
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error('本文更新の操作に失敗しました。明示対象・承認記録・接続先・現在の版を確認してください。');
      process.exitCode = 1;
    });
}
