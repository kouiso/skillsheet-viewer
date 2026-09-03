import { headers } from 'next/headers';
import { cache } from 'react';

import { getAuth } from '@/lib/auth';
import { reportDegradation } from '@/server/report-error';

/**
 * 編集者（オーナー）認可の単一チェックポイント（DAL）。
 * 編集者ログインは Better Auth セッション必須。HMAC（VIEWER_CODE / /viewer-auth）の
 * 閲覧用 cookie は閲覧専用で、編集権限は一切持たない（権限分離）。
 */
export async function isEditor(requestHeaders?: Headers): Promise<boolean> {
  return (await getEditorUserId(requestHeaders)) !== null;
}

/**
 * ログイン中の編集者（オーナー）の id。未ログイン、または SKILLSHEET_OWNER_ID と
 * 一致しないユーザーの場合は null。
 *
 * 多層防御: 公開サインアップは無効化済み（auth.ts の disableSignUp）だが、万一
 * オーナー以外のアカウントがセッションを持っても編集者とは見なさない。書き込み系は
 * この関数（および isEditor）が唯一のチェックポイント。
 */
async function resolveEditorUserId(requestHeaders?: Headers): Promise<string | null> {
  const ownerId = process.env.SKILLSHEET_OWNER_ID;
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL || !ownerId) {
    return null;
  }
  try {
    const session = await getAuth().api.getSession({ headers: requestHeaders ?? (await headers()) });
    const userId = session?.user?.id;
    if (!userId || userId !== ownerId) {
      return null;
    }
    return userId;
  } catch (err) {
    console.error('Better Auth session check failed:', err);
    // セッション確認が例外で落ちると、本物のオーナーも黙って編集者から降格する
    // （fail-safe だが気づけないと「保存できない」で問い合わせが来るまで放置される）。
    reportDegradation('Better Auth session check failed; editor status downgraded', { scope: 'auth-gate' });
    return null;
  }
}

/**
 * RSC 経路（引数なし呼び出し）専用のメモ化ラッパー。
 * React cache() は引数で keying するため、引数なしのときだけを通す別関数に
 * 分離しないとメモ化が効かない。/view レイアウトの requireViewer() と、各ページの
 * tRPC server caller が同一リクエストでそれぞれ編集者判定を行っても、Better Auth
 * セッション参照は 1 回に閉じる。requestHeaders を明示的に渡す HTTP 経路は
 * RSC レンダー外（1 リクエスト 1 回しか呼ばれない）なので対象外。
 */
const resolveEditorUserIdForRSC = cache((): Promise<string | null> => resolveEditorUserId());

export async function getEditorUserId(requestHeaders?: Headers): Promise<string | null> {
  if (requestHeaders) {
    return resolveEditorUserId(requestHeaders);
  }
  return resolveEditorUserIdForRSC();
}
