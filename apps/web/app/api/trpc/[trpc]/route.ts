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
  });
}

export { handler as GET, handler as POST };
