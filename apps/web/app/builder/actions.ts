'use server';

import { saveSkillSheetBlocks } from '@skillsheet/db';
import { revalidateTag } from 'next/cache';

import { isEditor } from '@/server/auth-gate';

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/**
 * ビルダーのブロック（順序付き markdown 配列）を DB に保存する。
 * Server Action 内でも認可を再検証する（多層防御。proxy 任せにしない）。
 */
export async function saveBlocksAction(markdowns: string[]): Promise<SaveResult> {
  if (!(await isEditor())) {
    return { ok: false, error: 'unauthorized' };
  }
  if (!Array.isArray(markdowns) || markdowns.some((m) => typeof m !== 'string')) {
    return { ok: false, error: 'invalid payload' };
  }

  try {
    await saveSkillSheetBlocks(markdowns);
    revalidateTag('db-sheet', {});
    return { ok: true };
  } catch (err) {
    console.error('saveBlocksAction failed:', err);
    return { ok: false, error: 'save failed' };
  }
}
