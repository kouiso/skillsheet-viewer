import { closeSync, fchmodSync, openSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
import { type Database, getDb } from '../src/db/client';
import { blocks, skillSheets } from '../src/db/schema';
import { loadScriptEnv } from './env';

/**
 * blocks テーブルを PDF 検査用の JSON へ書き出す。
 *
 * PDF のレイアウトは本文の長さで崩れる。本文は DB 側で変わるので、コードが無変更でも
 * 崩れうる。PR の CI では原理的に捕まらないため、定期実行の検査へ実データを渡す口が要る。
 * 受け取り側は `REAL_BLOCKS_JSON` にこのファイルのパスを取る（print-document.node.test.tsx）。
 */

const USAGE = `Usage: pnpm exec tsx scripts/dump-blocks.ts --out <path> [--sheet-id <uuid>]

  --out       書き出し先のパス（必須）
  --sheet-id  対象シート。省略時はシートがちょうど 1 枚のときだけそれを使う`;

export function parseArgs(args: string[]): { out: string; sheetId?: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (name !== '--out' && name !== '--sheet-id') throw new Error('不明なオプションです');
    if (values.has(name)) throw new Error(`${name} が重複しています`);
    const value = args[index + 1];
    if (!value?.trim() || value.startsWith('--')) throw new Error(`${name} の値がありません`);
    values.set(name, value);
  }
  const out = values.get('--out');
  if (!out) throw new Error(`--out が指定されていません\n${USAGE}`);
  const sheetId = values.get('--sheet-id');
  if (sheetId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sheetId)) {
    throw new Error('--sheet-id は UUID で指定してください');
  }
  return { out, ...(sheetId === undefined ? {} : { sheetId }) };
}

export function writePrivateDump(path: string, rows: unknown[]): void {
  const fd = openSync(path, 'w', 0o600);
  try {
    // 既存ファイルも本文を書き込む前に権限を制限する。
    fchmodSync(fd, 0o600);
    writeFileSync(fd, JSON.stringify(rows), 'utf-8');
  } finally {
    closeSync(fd);
  }
}

/** 省略時に黙って 1 枚を選ぶと、シートが増えた日から別のシートを検査し続けることになる。 */
export async function resolveSheetId(db: Database, explicit: string | undefined): Promise<string> {
  if (explicit) {
    // 存在しない id をそのまま通すと blocks が空配列で書き出され、下流の検査が
    // 「実データ 0 件」を正常として通してしまう。
    const [sheet] = await db
      .select({ id: skillSheets.id })
      .from(skillSheets)
      .where(eq(skillSheets.id, explicit))
      .limit(1);
    if (!sheet) {
      throw new Error('指定したシートが存在しません');
    }
    return sheet.id;
  }

  const sheets = await db.select({ id: skillSheets.id }).from(skillSheets);
  if (sheets.length === 0) {
    throw new Error('シートが 1 枚もありません');
  }
  if (sheets.length > 1) {
    throw new Error(`シートが ${sheets.length} 枚あります。--sheet-id で指定してください`);
  }
  return sheets[0].id;
}

async function main(): Promise<void> {
  const { out, sheetId: explicit } = parseArgs(process.argv.slice(2));
  loadScriptEnv();
  const db = getDb();
  const sheetId = await resolveSheetId(db, explicit);

  const rows = await db
    .select({ id: blocks.id, type: blocks.type, order: blocks.order, data: blocks.data })
    .from(blocks)
    .where(eq(blocks.sheetId, sheetId))
    .orderBy(asc(blocks.order));

  writePrivateDump(out, rows);

  // 本文そのものは実在の案件情報なので、件数だけ出してログには載せない。
  console.log(`wrote ${rows.length} blocks`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'データ取得に失敗しました');
    process.exitCode = 1;
  });
}
