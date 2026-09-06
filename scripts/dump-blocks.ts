import { writeFileSync } from 'node:fs';
import process from 'node:process';
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

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

/** 省略時に黙って 1 枚を選ぶと、シートが増えた日から別のシートを検査し続けることになる。 */
async function resolveSheetId(db: Database, explicit: string | undefined): Promise<string> {
  if (explicit) return explicit;

  const sheets = await db.select({ id: skillSheets.id, title: skillSheets.title }).from(skillSheets);
  if (sheets.length === 0) {
    throw new Error('シートが 1 枚もありません');
  }
  if (sheets.length > 1) {
    const titles = sheets.map((sheet) => `  ${sheet.id}  ${sheet.title}`).join('\n');
    throw new Error(`シートが ${sheets.length} 枚あります。--sheet-id で指定してください:\n${titles}`);
  }
  return sheets[0].id;
}

async function main(): Promise<void> {
  loadScriptEnv();

  const out = parseArg('out');
  if (!out) {
    console.error(USAGE);
    throw new Error('--out が指定されていません');
  }

  const db = getDb();
  const sheetId = await resolveSheetId(db, parseArg('sheet-id'));

  const rows = await db
    .select({ id: blocks.id, type: blocks.type, order: blocks.order, data: blocks.data })
    .from(blocks)
    .where(eq(blocks.sheetId, sheetId))
    .orderBy(asc(blocks.order));

  writeFileSync(out, JSON.stringify(rows), 'utf-8');

  // 本文そのものは実在の案件情報なので、件数だけ出してログには載せない。
  console.log(`wrote ${rows.length} blocks (sheet ${sheetId}) -> ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
