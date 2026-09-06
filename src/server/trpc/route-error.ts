import { TRPCError } from '@trpc/server';
import { NextResponse } from 'next/server';

import { reportTRPCError } from '@/server/report-error';

/** TRPC のコード → 返す HTTP ステータスと本文。ルートごとに違う部分だけを渡す。 */
export type RouteErrorMap = Partial<Record<TRPCError['code'], { status: number; message: string }>>;

/**
 * 互換 API 3本（/api/auth・/api/logout・/api/revalidate）が同じ形でコピーしていた
 * 「TRPCError → HTTP レスポンス」変換をここに集約する。
 *
 * ログを出す条件（想定内の 4xx は出さない）を各ルートに書き写していたため、
 * 片方だけ直すとログ方針が食い違う。判定は reportTRPCError（内部で shouldLogTRPCError を使う）
 * の1か所に寄せる。マップ済みコードの早期 return 順は変えない（変えると 403 が急に流れ出す）。
 */
export function trpcErrorToResponse(
  error: unknown,
  options: { label: string; fallbackMessage: string; map: RouteErrorMap },
): NextResponse {
  if (error instanceof TRPCError) {
    const mapped = options.map[error.code];
    if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
  reportTRPCError({ error, scope: options.label, logArgs: [`${options.label}: unexpected error:`, error] });
  return NextResponse.json({ error: options.fallbackMessage }, { status: 500 });
}
