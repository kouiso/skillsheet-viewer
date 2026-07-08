'use server';

import {
  type BlockInput,
  ConflictError,
  createSheet,
  deleteSheet,
  isBlockInput,
  listSheets,
  type SheetSummary,
  saveSkillSheetBlocks,
} from '@skillsheet/db';
import { revalidateTag } from 'next/cache';

import { isEditor } from '@/server/auth-gate';
import { getTemplate } from './templates';

export interface SaveResult {
  ok: boolean;
  error?: string;
  /**
   * A4: 保存成功時のサーバー時刻 updatedAt。クライアントはこれを次回保存の
   * expectedUpdatedAt に用いる（クライアント時計とのズレによる誤 Conflict を防ぐ）。
   */
  savedUpdatedAt?: Date;
}

export interface SaveBlocksPayload {
  title: string;
  blocks: BlockInput[];
  sheetId?: string;
  /** A3 並行保存ガード: 編集開始時の updatedAt を渡すと競合を検出して中断する。 */
  expectedUpdatedAt?: Date;
}

/**
 * ビルダーのブロック（タイトル＋型付きブロック配列）を DB に保存する。
 * Server Action 内でも認可を再検証する（多層防御。proxy 任せにしない）。
 * sheetId を指定することで複数シートに対応（未指定はデフォルトシートへ）。
 */
export async function saveBlocksAction(payload: SaveBlocksPayload): Promise<SaveResult> {
  if (!(await isEditor())) {
    return { ok: false, error: 'unauthorized' };
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.title !== 'string' ||
    !Array.isArray(payload.blocks) ||
    !payload.blocks.every(isBlockInput)
  ) {
    return { ok: false, error: 'invalid payload' };
  }

  try {
    // Server Action 境界を越えると Date は ISO 文字列にシリアライズされるため、
    // 型定義上 Date でも実行時は string の可能性がある。明示的に正規化する。
    const expectedUpdatedAt = payload.expectedUpdatedAt ? new Date(payload.expectedUpdatedAt) : undefined;
    const { updatedAt } = await saveSkillSheetBlocks(payload.title, payload.blocks, payload.sheetId, expectedUpdatedAt);
    // Next 16 の revalidateTag は第2引数必須。空の CacheLifeConfig({}) で
    // 当該タグを即時失効させ、保存直後に /view/db が最新を読むようにする。
    revalidateTag('db-sheet', {});
    return { ok: true, savedUpdatedAt: updatedAt };
  } catch (err) {
    if (err instanceof ConflictError) {
      return { ok: false, error: 'conflict' as const };
    }
    console.error('saveBlocksAction failed:', err);
    return { ok: false, error: 'save failed' };
  }
}

/** オーナーのシート一覧を返す。 */
export async function listSheetsAction(): Promise<{ ok: true; sheets: SheetSummary[] } | { ok: false; error: string }> {
  if (!(await isEditor())) {
    return { ok: false, error: 'unauthorized' };
  }
  try {
    const sheets = await listSheets();
    return { ok: true, sheets };
  } catch (err) {
    console.error('listSheetsAction failed:', err);
    return { ok: false, error: 'list failed' };
  }
}

/** 新規シートを作成して ID を返す。templateId を渡すとテンプレートブロックを初期値として挿入する。 */
export async function createSheetAction(
  title: string,
  templateId?: string,
): Promise<{ ok: true; sheetId: string } | { ok: false; error: string }> {
  if (!(await isEditor())) {
    return { ok: false, error: 'unauthorized' };
  }
  if (typeof title !== 'string') {
    return { ok: false, error: 'invalid title' };
  }
  try {
    const initialBlocks: BlockInput[] | undefined = templateId ? getTemplate(templateId)?.blocks : undefined;
    const sheetId = await createSheet(title, initialBlocks);
    revalidateTag('db-sheet', {});
    return { ok: true, sheetId };
  } catch (err) {
    console.error('createSheetAction failed:', err);
    return { ok: false, error: 'create failed' };
  }
}

/** 指定シートを削除する。 */
export async function deleteSheetAction(sheetId: string): Promise<SaveResult> {
  if (!(await isEditor())) {
    return { ok: false, error: 'unauthorized' };
  }
  if (typeof sheetId !== 'string') {
    return { ok: false, error: 'invalid sheetId' };
  }
  try {
    await deleteSheet(sheetId);
    revalidateTag('db-sheet', {});
    return { ok: true };
  } catch (err) {
    console.error('deleteSheetAction failed:', err);
    return { ok: false, error: 'delete failed' };
  }
}
