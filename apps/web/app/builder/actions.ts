'use server';

import { type BlockInput, isBlockInput, saveSkillSheetBlocks } from '@skillsheet/db';
import { revalidateTag } from 'next/cache';

import { isEditor } from '@/server/auth-gate';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface SaveBlocksPayload {
  title: string;
  blocks: BlockInput[];
}

/**
 * ビルダーのブロック（タイトル＋型付きブロック配列）を DB に保存する。
 * Server Action 内でも認可を再検証する（多層防御。proxy 任せにしない）。
 * payload は blocks.ts のバリデータで検証し、不正なら DB に触れず弾く。
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
    await saveSkillSheetBlocks(payload.title, payload.blocks);
    // Next 16 の revalidateTag は第2引数必須。空の CacheLifeConfig({}) で
    // 当該タグを即時失効させ、保存直後に /view/db が最新を読むようにする。
    revalidateTag('db-sheet', {});
    return { ok: true };
  } catch (err) {
    console.error('saveBlocksAction failed:', err);
    return { ok: false, error: 'save failed' };
  }
}
