import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { isEditor } from '@/server/auth-gate';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/server/session';

/**
 * /view 配下の閲覧認可の単一チェックポイント。
 *
 * 次のいずれかを満たせば閲覧を許可する:
 *  (a) 有効な HMAC 閲覧用セッション cookie がある（/viewer-auth で発行）
 *  (b) Better Auth の編集者（オーナー）としてログイン済み（isEditor）
 *
 * どちらも満たさない場合は /viewer-auth へリダイレクトする。
 * redirect() は内部で例外を投げるため、許可時のみ正常 return する。
 */
export async function requireViewer(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (verifySessionToken(token)) {
    return;
  }

  if (await isEditor()) {
    return;
  }

  redirect('/viewer-auth');
}
