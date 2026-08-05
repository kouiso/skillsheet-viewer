import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { isEditor } from '@/server/auth-gate';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/server/session';

/**
 * 閲覧認可の判定のみを行う純関数。
 *
 * 次のいずれかを満たせば true:
 *  (a) 有効な HMAC 閲覧用セッション cookie がある（/viewer-auth で発行）
 *  (b) Better Auth の編集者（オーナー）としてログイン済み（isEditor）
 *
 * redirect() を投げないため tRPC procedure からも呼べる
 * （tRPC の実行コンテキストには Server Action/RSC 専用の redirect() 例外制御が無い）。
 */
export async function isViewer(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (verifySessionToken(token)) {
    return true;
  }
  return isEditor();
}

/**
 * /view 配下の閲覧認可の単一チェックポイント。
 * 未許可なら /viewer-auth へリダイレクトする（redirect() は内部で例外を投げるため、
 * 許可時のみ正常 return する）。RSC / レイアウトからのみ呼ぶこと。
 */
export async function requireViewer(): Promise<void> {
  if (await isViewer()) {
    return;
  }
  redirect('/viewer-auth');
}
