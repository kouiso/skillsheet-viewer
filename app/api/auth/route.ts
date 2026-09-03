import { TRPCError } from '@trpc/server';
import { type NextRequest, NextResponse } from 'next/server';
import { VIEWER_AUTH_NOT_CONFIGURED_MESSAGE } from '@/server/known-config-error';
import { createTRPCContext } from '@/server/trpc/context';
import { createCallerFactory } from '@/server/trpc/init';
import { trpcErrorToResponse } from '@/server/trpc/route-error';
import { appRouter } from '@/server/trpc/router';
import { isSameOriginRequest } from '@/server/trpc/router/auth';

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
    // 設定不備だけは 500 でも本文を分ける（呼び出し側が「コードが違う」と誤解しないため）。
    // コードではなく message で判別するので、共通変換の前に見る。
    if (error instanceof TRPCError && error.message === VIEWER_AUTH_NOT_CONFIGURED_MESSAGE) {
      console.error('POST /api/auth: unexpected error:', error);
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    return trpcErrorToResponse(error, {
      label: 'POST /api/auth',
      fallbackMessage: 'Failed to authenticate',
      map: {
        FORBIDDEN: { status: 403, message: 'Forbidden' },
        BAD_REQUEST: { status: 400, message: 'Invalid request body' },
        UNAUTHORIZED: { status: 401, message: 'Invalid code' },
        TOO_MANY_REQUESTS: { status: 429, message: 'Too many attempts' },
      },
    });
  }
}
