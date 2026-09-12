import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../src/db/client';
import { blocks, skillSheets } from '../src/db/schema';
import { loadScriptEnv } from './env';

export interface BlockUpdate {
  id: string;
  sheetId: string;
  /** 読み取り時点のシート版。別編集が先行したら書き込まず中断する（R01: 時刻ではなく版で照合）。 */
  expectedRevision?: number;
  /** 更新後の data。ロック後のDB値と同値なら書き込みをスキップする。 */
  data: unknown;
  /** 読み取り時点の data。ロック後に変更前値として照合する。 */
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
  if (updates.length === 0) return { written: 0, skipped: 0, sheets: 0 };
  if (new Set(updates.map((update) => update.id)).size !== updates.length) {
    throw new Error('Duplicate block update');
  }
  const sheetIds = [...new Set(updates.map((update) => update.sheetId))].sort();
  return db.transaction(async (tx) => {
    // アプリ側の保存と同じシート行を、安定した順序でロックする。
    const lockedSheets = await tx
      .select({ id: skillSheets.id, revision: skillSheets.revision })
      .from(skillSheets)
      .where(inArray(skillSheets.id, sheetIds))
      .orderBy(skillSheets.id)
      .for('update');
    const currentRevision = new Map(lockedSheets.map((sheet) => [sheet.id, sheet.revision]));
    for (const sheetId of sheetIds) {
      if (!currentRevision.has(sheetId)) throw new Error(`Sheet not found: ${sheetId}`);
    }
    const currentBlocks = await tx
      .select({ id: blocks.id, sheetId: blocks.sheetId, data: blocks.data })
      .from(blocks)
      .where(
        inArray(
          blocks.id,
          updates.map((update) => update.id),
        ),
      );
    const byId = new Map(currentBlocks.map((block) => [block.id, block]));
    const changed: BlockUpdate[] = [];
    for (const update of updates) {
      const current = byId.get(update.id);
      if (!current || current.sheetId !== update.sheetId) {
        throw new Error(`Block missing or moved: ${update.id}`);
      }
      // 成功済みの再実行では、古い更新時刻でも書き込みを発生させない。
      if (isSameJson(current.data, update.data)) continue;
      if (!isSameJson(current.data, update.previous)) {
        throw new Error(`Concurrent update detected for block: ${update.id}`);
      }
      if (update.expectedRevision !== undefined) {
        const current = currentRevision.get(update.sheetId);
        if (current !== update.expectedRevision) {
          throw new Error(`Concurrent update detected for sheet: ${update.sheetId}`);
        }
      }
      changed.push(update);
    }
    for (const update of changed) {
      await tx
        .update(blocks)
        .set({ data: update.data })
        .where(and(eq(blocks.id, update.id), eq(blocks.sheetId, update.sheetId)));
    }
    const changedSheetIds = [...new Set(changed.map((update) => update.sheetId))];
    if (changedSheetIds.length > 0) {
      // 内容を変える全 writer は revision を進める（R01）。ここを通さない
      // saveSkillSheetBlocks 側の CAS と版の意味を一致させるための更新。
      await tx
        .update(skillSheets)
        .set({ updatedAt: sql`now()`, revision: sql`${skillSheets.revision} + 1` })
        .where(inArray(skillSheets.id, changedSheetIds));
    }
    return { written: changed.length, skipped: updates.length - changed.length, sheets: changedSheetIds.length };
  });
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
