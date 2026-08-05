import { getEditorUserId } from '@/server/auth-gate';
import { isViewer } from '@/server/viewer-gate';

/**
 * tRPC の全 procedure に渡るリクエストコンテキスト。
 * RSC からの直呼び（server caller）と Route Handler 経由（HTTP）の両方で
 * 同じ形になるよう、認可判定の解決をここに閉じる
 * （実際の cookies()/headers() 読み取りは auth-gate / viewer-gate 側が持つ）。
 */
export async function createTRPCContext() {
  const [editorUserId, viewer] = await Promise.all([getEditorUserId(), isViewer()]);
  return {
    // 編集者は閲覧も常に許可される（requireViewer() の (b) 分岐と同じ仕様）。
    editorUserId,
    isViewer: viewer || editorUserId !== null,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
