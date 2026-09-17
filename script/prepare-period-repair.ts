import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../src/db/client';
import { createDocumentService } from '../src/db/document-service';
import { getOwnerId } from '../src/db/skillsheet';
import { proposePeriodRepair } from './period-repair-proposal';
import { persistRepairProposal } from './repair-proposal-file';

export function parseRepairArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--sheet-id', '--out'].includes(key) || !value || value.startsWith('--') || values.has(key)) {
      throw new Error('INVALID_REPAIR_ARGUMENTS');
    }
    values.set(key, value);
  }
  const sheetId = values.get('--sheet-id');
  const out = values.get('--out');
  if (
    !sheetId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sheetId) ||
    !out ||
    !isAbsolute(out)
  ) {
    throw new Error('SHEET_ID_AND_ABSOLUTE_OUTPUT_REQUIRED');
  }
  return { sheetId, out };
}

/** 読取だけを受け取る。取得できない文書から空の修復案を作らない。 */
export async function preparePeriodRepair(
  reader: Pick<ReturnType<typeof createDocumentService>, 'read'>,
  owner: string,
  sheetId: string,
  out: string,
) {
  const result = await reader.read(sheetId);
  if (result.status !== 'OK') throw new Error('DOCUMENT_UNAVAILABLE');
  if (result.snapshot.sheetId.toLowerCase() !== sheetId.toLowerCase()) throw new Error('SNAPSHOT_ID_MISMATCH');
  const proposal = proposePeriodRepair(owner, result.snapshot);
  persistRepairProposal(out, proposal);
  return { approved: false, changes: proposal.changes.length, remainingIssues: proposal.remainingIssues.length };
}

/** 接続情報は明示環境変数のみ。暗黙の.env読込・既定シート選択・DB書込を行わない。 */
async function main() {
  const { sheetId, out } = parseRepairArgs(process.argv.slice(2));
  const owner = getOwnerId();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  console.log(JSON.stringify(await preparePeriodRepair(createDocumentService(getDb(), owner), owner, sheetId, out)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('修復案の準備に失敗しました。引数・明示接続情報・非公開出力先を確認してください。');
    process.exitCode = 1;
  });
}
