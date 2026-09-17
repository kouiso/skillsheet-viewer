import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../src/db/client';
import { loadPeriodRepair, resumePeriodRepair } from './resume-period-repair';
import { revertPeriodRepair } from './revert-period-repair';

export function parsePeriodRepairCommand(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !['--action', '--journal', '--owner', '--sheet-id'].includes(key) ||
      !value ||
      value.startsWith('--') ||
      values.has(key)
    )
      throw new Error('INVALID_REPAIR_ARGUMENTS');
    values.set(key, value);
  }
  const action = values.get('--action');
  const directory = values.get('--journal');
  const owner = values.get('--owner');
  const sheetId = values.get('--sheet-id');
  if (
    (action !== 'resume' && action !== 'revert') ||
    !directory ||
    !isAbsolute(directory) ||
    !owner?.trim() ||
    owner !== owner.trim() ||
    !sheetId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sheetId)
  ) {
    throw new Error('EXPLICIT_REPAIR_TARGET_REQUIRED');
  }
  return { action, directory, owner, sheetId };
}

/** .envを読まず、既存承認記録を照合してから明示接続先へ接続する。 */
export async function executePeriodRepairCommand(args: string[], databaseUrl: string | undefined) {
  const { action, directory, owner, sheetId } = parsePeriodRepairCommand(args);
  const { before } = loadPeriodRepair(directory, owner);
  if (before.sheetId.toLowerCase() !== sheetId.toLowerCase()) throw new Error('REPAIR_TARGET_MISMATCH');
  if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
  const db = createDb(databaseUrl);
  try {
    const result =
      action === 'resume'
        ? await resumePeriodRepair(db, directory, owner)
        : await revertPeriodRepair(db, directory, owner);
    return { action, sheetId: result.sheetId, revision: result.revision };
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executePeriodRepairCommand(process.argv.slice(2), process.env.DATABASE_URL)
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error('修復操作に失敗しました。明示対象・承認記録・接続先・現在の版を確認してください。');
      process.exitCode = 1;
    });
}
