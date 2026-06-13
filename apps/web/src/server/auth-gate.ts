import { cookies, headers } from 'next/headers';

import { getAuth } from '@/lib/auth';
import { SESSION_COOKIE_NAME, verifySessionToken } from './session';

/**
 * 編集者（オーナー）認可の単一チェックポイント（DAL）。
 * Better Auth セッションを優先し、フォールバックとして既存 HMAC トークンも受け付ける。
 *
 * - Better Auth: /api/auth/[...all] 経由でサインインした場合
 * - HMAC: 従来の /api/auth POST + VIEWER_CODE 経由（後方互換）
 */
export async function isEditor(): Promise<boolean> {
  // 1. Better Auth セッション確認
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session?.user) return true;

  // 2. フォールバック: 従来の HMAC セッション cookie
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}
