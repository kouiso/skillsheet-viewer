import type { TRPCContext } from './context';

interface TestContextInput {
  editorUserId: string | null;
  isViewer: boolean;
  request: Request | null;
  responseHeaders: Headers | null;
}

/**
 * テストで ctx を手組みするためのファクトリ。
 * 実運用の createTRPCContext は「初回アクセス時にだけ解決するメモ化リゾルバ」の形で
 * editorUserId / isViewer を持つ（DB 障害時に public procedure まで巻き込まれるのを防ぐため）。
 * テストは認可状態を既知の値として固定したいだけなので、同じ形へ即値をラップして返す。
 * procedure 本体・middleware の実装は本番と完全に同じものを通す。
 */
export function createTestContext(input: TestContextInput): TRPCContext {
  return {
    getEditorUserId: async () => input.editorUserId,
    getIsViewer: async () => input.isViewer,
    request: input.request,
    responseHeaders: input.responseHeaders,
  };
}
