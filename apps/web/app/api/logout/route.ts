import { TRPCError } from '@trpc/server';
import { type NextRequest, NextResponse } from 'next/server';

import { createTRPCContext } from '@/server/trpc/context';
import { createCallerFactory } from '@/server/trpc/init';
import { shouldLogTRPCError } from '@/server/trpc/log-error';
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
    if (error instanceof TRPCError && error.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!(error instanceof TRPCError) || shouldLogTRPCError(error.code)) {
      console.error('POST /api/logout: unexpected error:', error);
    }
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
}
