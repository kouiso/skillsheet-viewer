import { cookies } from 'next/headers';

import { SESSION_COOKIE_NAME, verifySessionToken } from './session';

/**
 * 編集者（オーナー）認可の単一チェックポイント（DAL）。
 * 公開閲覧は誰でも可だが、ビルダーでの編集・保存はセッション cookie を要求する。
 * proxy/middleware ではなくサーバー側のこの関数で都度検証する（多層防御・CVE-2025-29927 回避）。
 *
 * 当面は閲覧コード（VIEWER_CODE）で発行したセッションを編集ゲートに流用する
 * （プラン「まず自分専用」）。Phase 3 で Better Auth に置き換える。
 */
export async function isEditor(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}
