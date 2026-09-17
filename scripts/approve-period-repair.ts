import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../src/db/client';
import { canonicalJson } from '../src/db/document-contract';
import { createDocumentService } from '../src/db/document-service';
import { recordPeriodRepairApproval } from './period-repair-approval';
import { proposePeriodRepair, verifyPeriodRepair } from './period-repair-proposal';
import { persistPrivateRepairRecord, readPrivateRepairRecord } from './repair-proposal-file';

/** confirmedは本人が確認した差分のハッシュ。DBへは書き込まず承認と復旧情報を保存する。 */
export async function approvePeriodRepair(
  reader: Pick<ReturnType<typeof createDocumentService>, 'read'>,
  owner: string,
  sheetId: string,
  proposalPath: string,
  directory: string,
  confirmed: { beforeHash: string; afterHash: string },
) {
  const candidate = readPrivateRepairRecord(proposalPath);
  const current = await reader.read(sheetId);
  if (current.status !== 'OK' || current.snapshot.sheetId.toLowerCase() !== sheetId.toLowerCase()) {
    throw new Error('DOCUMENT_UNAVAILABLE');
  }
  const proposal = proposePeriodRepair(owner, current.snapshot);
  if (canonicalJson(candidate) !== canonicalJson(proposal)) throw new Error('STALE_OR_CHANGED_REPAIR');
  verifyPeriodRepair(owner, current.snapshot, proposal, confirmed);
  // 復旧情報を先に固定し、不一致の既存journalへ承認だけを追加しない。
  persistPrivateRepairRecord(join(directory, 'before.json'), { owner, snapshot: current.snapshot });
  persistPrivateRepairRecord(join(directory, 'proposal.json'), proposal);
  return recordPeriodRepairApproval(join(directory, 'approved.json'), owner, current.snapshot, proposal, confirmed);
}

export function parseApprovePeriodRepairArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !['--owner', '--sheet-id', '--proposal', '--journal', '--before-hash', '--after-hash'].includes(key) ||
      !value ||
      value.startsWith('--') ||
      values.has(key)
    )
      throw new Error('INVALID_APPROVAL_ARGUMENTS');
    values.set(key, value);
  }
  const owner = values.get('--owner');
  const sheetId = values.get('--sheet-id');
  const proposalPath = values.get('--proposal');
  const directory = values.get('--journal');
  const beforeHash = values.get('--before-hash');
  const afterHash = values.get('--after-hash');
  if (
    !owner?.trim() ||
    owner !== owner.trim() ||
    !sheetId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sheetId) ||
    !proposalPath ||
    !isAbsolute(proposalPath) ||
    !directory ||
    !isAbsolute(directory) ||
    !beforeHash ||
    !/^[0-9a-f]{64}$/.test(beforeHash) ||
    !afterHash ||
    !/^[0-9a-f]{64}$/.test(afterHash)
  ) {
    throw new Error('EXPLICIT_APPROVAL_REQUIRED');
  }
  return { owner, sheetId, proposalPath, directory, confirmed: { beforeHash, afterHash } };
}

async function main() {
  const args = parseApprovePeriodRepairArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const db = createDb(process.env.DATABASE_URL);
  try {
    const approval = await approvePeriodRepair(
      createDocumentService(db, args.owner),
      args.owner,
      args.sheetId,
      args.proposalPath,
      args.directory,
      args.confirmed,
    );
    console.log(JSON.stringify({ approved: true, sheetId: approval.sheetId, revision: approval.expectedRevision }));
  } finally {
    await db.$client.end();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('承認記録を保存できませんでした。確認済みハッシュ・対象・現在の版・非公開記録先を確認してください。');
    process.exitCode = 1;
  });
}
