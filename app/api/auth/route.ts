import { TRPCError } from '@trpc/server';
import { type NextRequest, NextResponse } from 'next/server';

import { createTRPCContext } from '@/server/trpc/context';
import { createCallerFactory } from '@/server/trpc/init';
import { shouldLogTRPCError } from '@/server/trpc/log-error';
import { appRouter } from '@/server/trpc/router';
import { isSameOriginRequest, VIEWER_AUTH_NOT_CONFIGURED_MESSAGE } from '@/server/trpc/router/auth';

const createCaller = createCallerFactory(appRouter);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 既存クライアント向けの互換アダプタ。
 * 新しい画面は auth.login procedure を直接使い、認証ロジックは tRPC 側だけが持つ。
 */
export async function POST(req: NextRequest) {
  // 旧 Route Handler も tRPC procedure と同じ順序で origin を検証する。
  // body を先に読むと cross-origin の不正 JSON が 403 ではなく 400 になる。
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await req.json();
  } catch (err) {
    console.error('POST /api/auth: failed to parse request body:', err);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const responseHeaders = new Headers();
  const caller = createCaller(createTRPCContext({ req, resHeaders: responseHeaders }));
  try {
    const result = await caller.auth.login(input as { code: string });
    return NextResponse.json(result, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === 'FORBIDDEN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.code === 'BAD_REQUEST') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
      }
      if (error.code === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
      }
      if (error.code === 'INTERNAL_SERVER_ERROR' && error.message === VIEWER_AUTH_NOT_CONFIGURED_MESSAGE) {
        console.error('POST /api/auth: unexpected error:', error);
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
    }
    if (!(error instanceof TRPCError) || shouldLogTRPCError(error.code)) {
      console.error('POST /api/auth: unexpected error:', error);
    }
    return NextResponse.json({ error: 'Failed to authenticate' }, { status: 500 });
  }
}
