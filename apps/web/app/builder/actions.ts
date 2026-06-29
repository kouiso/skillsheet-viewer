'use server';

import {
  type BlockInput,
  createSheet,
  deleteSheet,
  isBlockInput,
  listSheets,
  type SheetSummary,
  saveSkillSheetBlocks,
} from '@skillsheet/db';
import { revalidateTag } from 'next/cache';

import { isEditor } from '@/server/auth-gate';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface SaveBlocksPayload {
  title: string;
  blocks: BlockInput[];
  sheetId?: string;
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
    await saveSkillSheetBlocks(payload.title, payload.blocks, payload.sheetId);
    // Next 16 の revalidateTag は第2引数必須。空の CacheLifeConfig({}) で
    // 当該タグを即時失効させ、保存直後に /view/db が最新を読むようにする。
    revalidateTag('db-sheet', {});
    return { ok: true };
  } catch (err) {
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

/** 新規シートを作成して ID を返す。 */
export async function createSheetAction(
  title: string,
): Promise<{ ok: true; sheetId: string } | { ok: false; error: string }> {
  if (!(await isEditor())) {
    return { ok: false, error: 'unauthorized' };
  }
  if (typeof title !== 'string') {
    return { ok: false, error: 'invalid title' };
  }
  try {
    const sheetId = await createSheet(title);
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
