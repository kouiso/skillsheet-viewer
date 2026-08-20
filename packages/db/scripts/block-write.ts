import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../src/client';
import { blocks, skillSheets } from '../src/schema';
import { loadScriptEnv } from './env';

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

/**
 * .env を読んで `DATABASE_URL` 等をプロセスへ流し込む。
 * 探す場所とパース規則は `./env` に集約してある（以前は各スクリプトが同じ処理を持っていた）。
 */
export function loadWebEnvLocal(): void {
  loadScriptEnv({ required: true });
}
