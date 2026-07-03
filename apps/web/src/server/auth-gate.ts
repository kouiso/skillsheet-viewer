import { headers } from 'next/headers';

import { getAuth } from '@/lib/auth';

/**
 * 編集者（オーナー）認可の単一チェックポイント（DAL）。
 * 編集者ログインは Better Auth セッション必須。HMAC（VIEWER_CODE / /viewer-auth）の
 * 閲覧用 cookie は閲覧専用で、編集権限は一切持たない（権限分離）。
 */
export async function isEditor(): Promise<boolean> {
  // Better Auth 未構成時は編集者は存在しない（閲覧用 HMAC は編集不可）。
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL) {
    return false;
  }
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    return Boolean(session?.user);
  } catch (err) {
    console.error('Better Auth session check failed:', err);
    return false;
  }
}

/** ログイン中の編集者（Better Auth ユーザー）の id。未ログインなら null。 */
export async function getEditorUserId(): Promise<string | null> {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL) {
    return null;
  }
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch (err) {
    console.error('Better Auth session check failed:', err);
    return null;
  }
}
