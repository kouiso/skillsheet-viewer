import { headers } from 'next/headers';

import { getAuth } from '@/lib/auth';

/**
 * 編集者（オーナー）認可の単一チェックポイント（DAL）。
 * 編集者ログインは Better Auth セッション必須。HMAC（VIEWER_CODE / /viewer-auth）の
 * 閲覧用 cookie は閲覧専用で、編集権限は一切持たない（権限分離）。
 */
export async function isEditor(): Promise<boolean> {
  return (await getEditorUserId()) !== null;
}

/**
 * ログイン中の編集者（オーナー）の id。未ログイン、または SKILLSHEET_OWNER_ID と
 * 一致しないユーザーの場合は null。
 *
 * 多層防御: 公開サインアップは無効化済み（auth.ts の disableSignUp）だが、万一
 * オーナー以外のアカウントがセッションを持っても編集者とは見なさない。書き込み系は
 * この関数（および isEditor）が唯一のチェックポイント。
 */
export async function getEditorUserId(): Promise<string | null> {
  const ownerId = process.env.SKILLSHEET_OWNER_ID;
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL || !ownerId) {
    return null;
  }
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId || userId !== ownerId) {
      return null;
    }
    return userId;
  } catch (err) {
    console.error('Better Auth session check failed:', err);
    return null;
  }
}
