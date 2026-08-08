import { TRPCError } from '@trpc/server';
import { type NextRequest, NextResponse } from 'next/server';

import { createTRPCContext } from '@/server/trpc/context';
import { createCallerFactory } from '@/server/trpc/init';
import { shouldLogTRPCError } from '@/server/trpc/log-error';
import { appRouter } from '@/server/trpc/router';

const createCaller = createCallerFactory(appRouter);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * webhook・運用スクリプト向けの互換アダプタ。
 * secret 検証とタグ失効は maintenance.revalidate procedure だけが実装する。
 */
export async function POST(req: NextRequest) {
  const caller = createCaller(createTRPCContext({ req }));
  try {
    const result = await caller.maintenance.revalidate();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(error instanceof TRPCError) || shouldLogTRPCError(error.code)) {
      console.error('POST /api/revalidate: unexpected error:', error);
    }
    // REVALIDATE_SECRET 未設定・revalidateTag 失敗のどちらでもここに落ちるため、
    // 原因を断定する文言は返さない（詳細はサーバーログを見る）。
    return NextResponse.json({ error: 'Failed to revalidate' }, { status: 500 });
  }
}
