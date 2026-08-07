import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { isEditor } from '@/server/auth-gate';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/server/session';
import { resolveNextPath } from '@/util/resolve-next-path';

/** middleware.ts が焼き込む、現在のリクエストパス（+ クエリ）を運ぶヘッダー名。 */
const CURRENT_PATH_HEADER = 'x-skillsheet-pathname';

// resolveNextPath は「実際のオリジンと一致するか」で判定する（#159）。ここはサーバー側で、
// middleware.ts が request.nextUrl から組み立てた値（scheme/host を含まないパスのみ）を渡すため、
// 実オリジンを取得する必要はない。固定の内部オリジンを基準にすれば、万一パス以外の値が
// 紛れ込んでも（絶対URL・プロトコル相対URL等）同じロジックで弾ける。
const INTERNAL_ORIGIN = 'http://skillsheet-viewer.internal';

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

  // middleware.ts がヘッダーへ焼き込んだ現在のパスを ?next= に載せることで、
  // 認証後に元々開こうとしていたシートへ戻れるようにする（#155）。
  // resolveNextPath で内部パスであることを検証してからのみ載せる（オープンリダイレクト対策）。
  const headerList = await headers();
  const currentPath = headerList.get(CURRENT_PATH_HEADER);
  // fallback を空文字にし、内部パスとして無効（未取得含む）なら next を付けない。
  const next = resolveNextPath(currentPath, '', INTERNAL_ORIGIN);

  redirect(next ? `/viewer-auth?next=${encodeURIComponent(next)}` : '/viewer-auth');
}
