import { TRPCError } from '@trpc/server';
import { NextResponse } from 'next/server';

import { shouldLogTRPCError } from './log-error';

/** TRPC のコード → 返す HTTP ステータスと本文。ルートごとに違う部分だけを渡す。 */
export type RouteErrorMap = Partial<Record<TRPCError['code'], { status: number; message: string }>>;

/**
 * 互換 API 3本（/api/auth・/api/logout・/api/revalidate）が同じ形でコピーしていた
 * 「TRPCError → HTTP レスポンス」変換をここに集約する。
 *
 * ログを出す条件（想定内の 4xx は出さない）を各ルートに書き写していたため、
 * 片方だけ直すとログ方針が食い違う。判定は shouldLogTRPCError の1か所に寄せる。
 */
export function trpcErrorToResponse(
  error: unknown,
  options: { label: string; fallbackMessage: string; map: RouteErrorMap },
): NextResponse {
  if (error instanceof TRPCError) {
    const mapped = options.map[error.code];
    if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
  if (!(error instanceof TRPCError) || shouldLogTRPCError(error.code)) {
    console.error(`${options.label}: unexpected error:`, error);
  }
  return NextResponse.json({ error: options.fallbackMessage }, { status: 500 });
}
