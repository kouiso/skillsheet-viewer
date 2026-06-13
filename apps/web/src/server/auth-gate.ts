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
  //    必要な環境変数が揃っている時のみ実行する。未構成時に毎リクエスト
  //    getAuth() が throw してログ公害になるのを防ぎ、真のエラー（DB接続
  //    失敗など）だけを console.error に残す。例外時は HMAC へ降格し、
  //    Better Auth 単体の不調で /builder 全体が 500 になるのを防ぐ。
  if (process.env.BETTER_AUTH_SECRET && process.env.DATABASE_URL) {
    try {
      const session = await getAuth().api.getSession({ headers: await headers() });
      if (session?.user) return true;
    } catch (err) {
      console.error('Better Auth session check failed; falling back to HMAC session:', err);
    }
  }

  // 2. フォールバック: 従来の HMAC セッション cookie
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}
