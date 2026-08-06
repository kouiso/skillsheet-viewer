import { getEditorUserId } from '@/server/auth-gate';
import { isViewer } from '@/server/viewer-gate';

/**
 * tRPC の全 procedure に渡るリクエストコンテキスト。
 * RSC からの直呼び（server caller）と Route Handler 経由（HTTP）の両方で
 * 同じ形になるよう、認可判定の解決をここに閉じる
 * （実際の cookies()/headers() 読み取りは auth-gate / viewer-gate 側が持つ）。
 */
export async function createTRPCContext() {
  // isViewer() は閲覧 cookie が無効なとき内部で isEditor()（= getEditorUserId()）を
  // 呼ぶため、並列に両方叩くと編集者リクエストで Better Auth の getSession() が
  // 二重に走る。先に editorUserId を解決し、編集者ならその時点で isViewer() 呼び出し
  // 自体を短絡で省く（編集者は閲覧も常に許可される＝ requireViewer() の (b) 分岐と同じ仕様）。
  const editorUserId = await getEditorUserId();
  return {
    editorUserId,
    isViewer: editorUserId !== null || (await isViewer()),
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
