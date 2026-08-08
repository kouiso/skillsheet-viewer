import { getEditorUserId } from '@/server/auth-gate';
import { hasViewerSession } from '@/server/viewer-gate';

/**
 * tRPC の全 procedure に渡るリクエストコンテキスト。
 * RSC からの直呼び（server caller）と Route Handler 経由（HTTP）の両方で
 * 同じ形になるよう、認可判定の解決をここに閉じる
 * （実際の cookies()/headers() 読み取りは auth-gate / viewer-gate 側が持つ）。
 */
interface TRPCContextOptions {
  req?: Request;
  resHeaders?: Headers;
}

/**
 * context 生成時点では認可判定を一切実行しない。
 * `auth.login` / `auth.logout` / `maintenance.revalidate` のような publicProcedure は
 * 編集者判定（Better Auth セッション + DB 参照）を必要としないため、無条件 await すると
 * DB 障害時に閲覧コード認証まで巻き込まれて遅延・失敗する。
 * 各リゾルバは初回呼び出し時にだけ実行し、以降は同じ Promise を返して
 * 同一リクエスト内での重複解決（例: viewerProcedure と editorProcedure の両方に
 * 触れる呼び出し）を防ぐ。
 */
export function createTRPCContext(options?: TRPCContextOptions) {
  const requestHeaders = options?.req?.headers;

  let editorUserIdPromise: Promise<string | null> | null = null;
  const resolveEditorUserId = (): Promise<string | null> => {
    if (!editorUserIdPromise) {
      editorUserIdPromise = getEditorUserId(requestHeaders);
    }
    return editorUserIdPromise;
  };

  let isViewerPromise: Promise<boolean> | null = null;
  const resolveIsViewer = (): Promise<boolean> => {
    if (!isViewerPromise) {
      isViewerPromise = (async () => {
        if ((await resolveEditorUserId()) !== null) return true;
        return hasViewerSession(requestHeaders);
      })();
    }
    return isViewerPromise;
  };

  return {
    getEditorUserId: resolveEditorUserId,
    getIsViewer: resolveIsViewer,
    request: options?.req ?? null,
    responseHeaders: options?.resHeaders ?? null,
  };
}

export type TRPCContext = ReturnType<typeof createTRPCContext>;
