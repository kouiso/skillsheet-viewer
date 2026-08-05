import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createTRPCContext } from '@/server/trpc/context';
import { appRouter } from '@/server/trpc/router';

// DATABASE_URL 等はランタイム専用のため、このルートは常に動的に実行する。
export const dynamic = 'force-dynamic';

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
    // onError 未設定だとエラーが HTTP レスポンス（TRPCError の code/message）にしか残らず、
    // サーバー側ログには一切出ない。UNAUTHORIZED/NOT_FOUND/CONFLICT は procedure 側で
    // 意図的に投げている想定内の分岐なので握りつぶし、それ以外（入力検証失敗や想定外の
    // 例外）だけ根本原因が追えるよう記録する。
    onError({ error, path }) {
      if (['UNAUTHORIZED', 'NOT_FOUND', 'CONFLICT'].includes(error.code)) return;
      console.error(`tRPC error on ${path ?? '<unknown>'}:`, error);
    },
  });
}

export { handler as GET, handler as POST };
