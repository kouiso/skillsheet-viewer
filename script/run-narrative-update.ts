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
import { loadNarrativeUpdate, narrativeAppliedRecord } from './load-narrative-update';
import { recordNarrativeApproval } from './narrative-approval';
import {
  appendNarrativeJournal,
  type NarrativeJournalEntry,
  narrativeChangeId,
  readNarrativeJournal,
  validateNarrativeJournalEntry,
} from './narrative-journal';
import { type NarrativeProposal, proposeNarrativeUpdate, verifyNarrativeProposal } from './narrative-proposal';
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

/**
 * journal の全行を保存契約（validateNarrativeJournalEntry）で検証してから、この操作（owner・sheetId・revision・hash・change一覧）と
 * 同一の行だけを記録済みとして扱う。不正行は重複抑止に使わず拒否する。
 */
function recordedJournalStates(
  journal: unknown[],
  owner: string,
  proposal: NarrativeProposal,
): Set<NarrativeJournalEntry['state']> {
  const entries = journal.map((raw) => {
    validateNarrativeJournalEntry(raw);
    return raw;
  });
  const identity = journalEntry('approved', owner, proposal);
  const changeIds = canonicalJson(identity.changeIds);
  return new Set(
    entries
      .filter(
        (entry) =>
          entry.owner === identity.owner &&
          entry.sheetId === identity.sheetId &&
          entry.expectedRevision === identity.expectedRevision &&
          entry.beforeHash === identity.beforeHash &&
          entry.afterHash === identity.afterHash &&
          canonicalJson(entry.changeIds) === changeIds,
      )
      .map((entry) => entry.state),
  );
}

const sameContent = (snapshot: DocumentSnapshot, before: DocumentSnapshot, blocks: DocumentSnapshot['blocks']) =>
  snapshot.sheetId === before.sheetId &&
  snapshot.title === before.title &&
  canonicalJson(snapshot.blocks) === canonicalJson(blocks);

export async function applyNarrative(db: Pick<Database, 'execute'>, owner: string, directory: string, sheetId: string) {
  // 部分行・不正行のあるjournalへ追記して証跡を壊さない。保存記録の読込やDB更新より先に検証する。
  const journal = readNarrativeJournal(join(directory, JOURNAL));
  const { before, proposal, approval } = loadNarrativeUpdate(directory, owner, sheetId);
  const recorded = recordedJournalStates(journal, owner, proposal);
  const service = createDocumentService(db, owner);
  const current = await service.read(before.sheetId);
  if (current.status !== 'OK') throw new Error('NARRATIVE_RESUME_CONFLICT');
  let after: DocumentSnapshot;
  if (current.snapshot.revision === before.revision && sameContent(current.snapshot, before, before.blocks)) {
    after = await applyNarrativeUpdate(db, owner, proposal, approval);
  } else if (
    BigInt(current.snapshot.revision) === BigInt(before.revision) + 1n &&
    sameContent(current.snapshot, before, proposal.blocks)
  ) {
    // CAS後に応答または完了記録を失った場合だけ再開する。
    after = current.snapshot;
  } else {
    throw new Error('NARRATIVE_RESUME_CONFLICT');
  }
  persistPrivateRepairRecord(join(directory, 'db-applied.json'), narrativeAppliedRecord(owner, before, proposal));
  // 再開・再実行で同じ状態を再追記しない（synced の後に sync-pending へ戻さない）。
  if (!recorded.has('db-applied'))
    appendNarrativeJournal(join(directory, JOURNAL), journalEntry('db-applied', owner, proposal));
  if (!recorded.has('sync-pending') && !recorded.has('synced'))
    appendNarrativeJournal(join(directory, JOURNAL), journalEntry('sync-pending', owner, proposal));
  return { sheetId: after.sheetId, revision: after.revision };
}

export async function revertNarrative(
  db: Pick<Database, 'execute'>,
  owner: string,
  directory: string,
  sheetId: string,
) {
  // 戻しも同じく、保存記録の読込やDB更新より先にjournalを検証する。
  const journal = readNarrativeJournal(join(directory, JOURNAL));
  const { before, proposal } = loadNarrativeUpdate(directory, owner, sheetId);
  const recorded = recordedJournalStates(journal, owner, proposal);
  const applied = narrativeAppliedRecord(owner, before, proposal);
  if (canonicalJson(readPrivateRepairRecord(join(directory, 'db-applied.json'))) !== canonicalJson(applied)) {
    throw new Error('NARRATIVE_APPLIED_RECORD_MISMATCH');
  }
  const request = { ...applied, kind: 'narrative-update-revert-requested' };
  const revertedRevision = (BigInt(before.revision) + 2n).toString();
  const service = createDocumentService(db, owner);
  const current = await service.read(before.sheetId);
  if (current.status !== 'OK') throw new Error('NARRATIVE_REVERT_CONFLICT');
  const snapshot = current.snapshot;
  if (snapshot.revision === revertedRevision && sameContent(snapshot, before, before.blocks)) {
    if (canonicalJson(readPrivateRepairRecord(join(directory, 'revert-requested.json'))) !== canonicalJson(request)) {
      throw new Error('NARRATIVE_REVERT_CONFLICT');
    }
  } else {
    if (snapshot.revision !== applied.revision || !sameContent(snapshot, before, proposal.blocks)) {
      throw new Error('NARRATIVE_REVERT_CONFLICT');
    }
    persistPrivateRepairRecord(join(directory, 'revert-requested.json'), request);
    const result = await db.execute(sql`select skillsheet_private.replace_sheet(
      ${before.sheetId}::uuid, ${applied.revision}::text, ${before.title}::text,
      ${canonicalJson(before.blocks)}::jsonb, ${owner}::text) as result`);
    const rows = Array.isArray(result) ? result : result.rows;
    if ((rows[0] as { result?: { status?: string } } | undefined)?.result?.status !== 'OK') {
      throw new Error('NARRATIVE_REVERT_CONFLICT');
    }
  }
  const after = await service.read(before.sheetId);
  if (
    after.status !== 'OK' ||
    after.snapshot.revision !== revertedRevision ||
    !sameContent(after.snapshot, before, before.blocks)
  ) {
    throw new Error('NARRATIVE_REVERT_READBACK_MISMATCH');
  }
  // 完了記録を失っても固定済み要求とDB全文の一致から安全に再開できる。
  persistPrivateRepairRecord(join(directory, 'reverted.json'), {
    ...applied,
    kind: 'narrative-update-reverted',
    revision: revertedRevision,
  });
  if (!recorded.has('reverted'))
    appendNarrativeJournal(join(directory, JOURNAL), journalEntry('reverted', owner, proposal));
  return { sheetId: before.sheetId, revision: after.snapshot.revision };
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
