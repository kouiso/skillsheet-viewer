import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { reportTRPCError } from '@/server/report-error';
import { createTRPCContext } from '@/server/trpc/context';
import { shouldLogTRPCError } from '@/server/trpc/log-error';
import { appRouter } from '@/server/trpc/router';

// DATABASE_URL 等はランタイム専用のため、このルートは常に動的に実行する。
export const dynamic = 'force-dynamic';

export { shouldLogTRPCError };

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
    // onError 未設定だとエラーが HTTP レスポンス（TRPCError の code/message）にしか残らず、
    // サーバー側ログには一切出ない。
    onError({ error, path }) {
      const label = `trpc:${path ?? '<unknown>'}`;
      reportTRPCError({ error, scope: label, logArgs: [`tRPC error on ${path ?? '<unknown>'}:`, error] });
    },
  });
}

export { handler as GET, handler as POST };
