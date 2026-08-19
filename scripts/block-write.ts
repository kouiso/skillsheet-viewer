/**
 * project ブロックを一括更新するスクリプト（backfill-project-data / apply-project-narrative）が
 * 共有する書き込み口と環境変数ローダ。
 *
 * アプリ側の保存（`saveSkillSheetBlocks`）は `skill_sheets.updated_at` を使った楽観ロックで
 * 並行保存を弾く。スクリプトが blocks だけを黙って書き換えると、この仕組みが両方向に破れる:
 *
 *   - スクリプト → アプリ: 全行を無条件 UPDATE すると、走っている最中に入った保存を上書きする
 *   - アプリ → スクリプト: `updated_at` を進めないため、スクリプト実行前に開かれていた編集タブが
 *     古い `expectedUpdatedAt` のまま保存に成功し（衝突と判定されない）、`DELETE 全ブロック +
 *     INSERT` でスクリプトの反映を丸ごと消す
 *
 * そこで、(1) 中身が実際に変わった行だけ UPDATE し、(2) 変えた行を持つシートの
 * `updated_at` を進め、(3) 全体を1トランザクションにまとめる。これで古いタブの保存は
 * ConflictError になり、途中で失敗しても中途半端な状態が残らない。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../src/db/client';
import { blocks, skillSheets } from '../src/db/schema';

export interface BlockUpdate {
  id: string;
  sheetId: string;
  /** 更新後の data。元の data と deep-equal なら書き込みをスキップする。 */
  data: unknown;
  /** 元の data。差分判定に使う。 */
  previous: unknown;
}

export interface WriteResult {
  written: number;
  skipped: number;
  sheets: number;
}

/** JSON として同値かを見る。jsonb 側もキー順は保持されないため、順序差は差分に数えない。 */
function isSameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
}

export async function writeBlockUpdates(db: Database, updates: BlockUpdate[]): Promise<WriteResult> {
  const changed = updates.filter((u) => !isSameJson(u.data, u.previous));
  const sheetIds = [...new Set(changed.map((u) => u.sheetId))];
  if (changed.length === 0) {
    return { written: 0, skipped: updates.length, sheets: 0 };
  }
  await db.transaction(async (tx) => {
    // アプリ側の保存と同じ行ロックを取り、保存トランザクションと直列化する。
    await tx.select({ id: skillSheets.id }).from(skillSheets).where(inArray(skillSheets.id, sheetIds)).for('update');
    for (const update of changed) {
      await tx.update(blocks).set({ data: update.data }).where(eq(blocks.id, update.id));
    }
    // 古い expectedUpdatedAt を持つ編集タブの保存が ConflictError になるよう、必ず進める。
    await tx.update(skillSheets).set({ updatedAt: sql`now()` }).where(inArray(skillSheets.id, sheetIds));
  });
  return { written: changed.length, skipped: updates.length - changed.length, sheets: sheetIds.length };
}

/**
 * 更新対象のシートを明示的に絞り込む。
 *
 * 案件本文の一括更新は「案件タイトル」「会社名」の文字列一致だけで書き換え先を決めるため、
 * 対象シートを限定しないと、同じ DB にある検証用デモシートや別オーナーのシートまで
 * 巻き込んで書き換わる。DB 全体を無条件に対象にする経路を残さないよう、
 * `--sheet-id` か `SKILLSHEET_OWNER_ID` のどちらかを必須にする。
 */
export async function resolveTargetSheetIds(db: Database, argv: string[]): Promise<string[]> {
  const flagIndex = argv.findIndex((a) => a === '--sheet-id' || a.startsWith('--sheet-id='));
  if (flagIndex !== -1) {
    const raw = argv[flagIndex];
    const id = raw.includes('=') ? raw.slice(raw.indexOf('=') + 1) : argv[flagIndex + 1];
    if (!id) throw new Error('--sheet-id にシート ID を渡してください');
    const found = await db.select({ id: skillSheets.id }).from(skillSheets).where(eq(skillSheets.id, id));
    if (found.length === 0) throw new Error(`シートが見つかりません: ${id}`);
    return [id];
  }

  const ownerId = process.env.SKILLSHEET_OWNER_ID;
  if (!ownerId) {
    throw new Error('更新対象が絞れません。--sheet-id を渡すか SKILLSHEET_OWNER_ID を設定してください');
  }
  const owned = await db.select({ id: skillSheets.id }).from(skillSheets).where(eq(skillSheets.ownerId, ownerId));
  if (owned.length === 0) throw new Error(`オーナー ${ownerId} のシートがありません`);
  return owned.map((row) => row.id);
}

/** 対象シートに属する project ブロックだけを引く条件。 */
export function projectBlocksOfSheets(sheetIds: string[]) {
  return and(eq(blocks.type, 'project'), inArray(blocks.sheetId, sheetIds));
}

/** `.env.local` を読んで `DATABASE_URL` 等をプロセスへ流し込む。 */
export function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../.env.local');
  if (!existsSync(envPath)) {
    throw new Error(`.env.local が見つかりません: ${envPath}`);
  }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
