import { type NextRequest, NextResponse } from 'next/server';

import { createTRPCContext } from '@/server/trpc/context';
import { createCallerFactory } from '@/server/trpc/init';
import { trpcErrorToResponse } from '@/server/trpc/route-error';
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
    // REVALIDATE_SECRET 未設定・revalidateTag 失敗のどちらでもここに落ちるため、
    // 原因を断定する文言は返さない（詳細はサーバーログを見る）。
    return trpcErrorToResponse(error, {
      label: 'POST /api/revalidate',
      fallbackMessage: 'Failed to revalidate',
      map: { UNAUTHORIZED: { status: 401, message: 'Unauthorized' } },
    });
  }
}
