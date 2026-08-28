import { type NextRequest, NextResponse } from 'next/server';

import { createTRPCContext } from '@/server/trpc/context';
import { createCallerFactory } from '@/server/trpc/init';
import { trpcErrorToResponse } from '@/server/trpc/route-error';
import { appRouter } from '@/server/trpc/router';

const createCaller = createCallerFactory(appRouter);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 旧 URL を auth.logout procedure へ委譲する後方互換アダプタ。 */
export async function POST(req: NextRequest) {
  const responseHeaders = new Headers();
  const caller = createCaller(createTRPCContext({ req, resHeaders: responseHeaders }));
  try {
    const result = await caller.auth.logout();
    return NextResponse.json(result, { headers: responseHeaders });
  } catch (error) {
    return trpcErrorToResponse(error, {
      label: 'POST /api/logout',
      fallbackMessage: 'Failed to log out',
      map: { FORBIDDEN: { status: 403, message: 'Forbidden' } },
    });
  }
}
