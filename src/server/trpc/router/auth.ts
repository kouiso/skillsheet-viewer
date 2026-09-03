import { createHash, timingSafeEqual } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { clientKeyFromHeaders } from '@/db/viewer-rate-limit';

import { VIEWER_AUTH_NOT_CONFIGURED_MESSAGE } from '@/server/known-config-error';
import { appendExpiredSessionCookie, appendSessionCookie } from '@/server/session';
import { clearViewerLoginRateLimit, reserveViewerLoginAttemptBoth } from '@/server/viewer-rate-limit';

import { publicProcedure, router } from '../init';
import { viewerLoginInputSchema } from '../schema';

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requireHttpMutationContext(
  request: Request | null,
  responseHeaders: Headers | null,
): { request: Request; responseHeaders: Headers } {
  if (!request || !responseHeaders) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'HTTP response context is required' });
  }
  if (!isSameOriginRequest(request)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'cross-origin request is not allowed' });
  }
  return { request, responseHeaders };
}

export const authRouter = router({
  // publicProcedure なので viewerProcedure/editorProcedure の middleware は通らない。
  // login/logout とは異なりここでは実際に認可状態を必要とするため、明示的に await する。
  status: publicProcedure.query(async ({ ctx }) => {
    const [editorUserId, canView] = await Promise.all([ctx.getEditorUserId(), ctx.getIsViewer()]);
    return { canEdit: editorUserId !== null, canView };
  }),

  login: publicProcedure.input(viewerLoginInputSchema).mutation(async ({ ctx, input }) => {
    const { request, responseHeaders } = requireHttpMutationContext(ctx.request, ctx.responseHeaders);
    const viewerCode = process.env.VIEWER_CODE ?? process.env.VITE_VIEWER_CODE;
    if (!viewerCode) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: VIEWER_AUTH_NOT_CONFIGURED_MESSAGE });
    }

    // 共有の閲覧コード 1 本が唯一の防御なので、回数制限が無いとオンライン総当たりが成立する
    // （実測で毎秒 337 回通った）。
    //
    // 「ロックを確認 → 照合 → 失敗を記録」の3段にすると、同じ送り元から並列に投げられた
    // リクエストが全部「まだロックされていない」を読み、上限を超えた数の照合まで進んでしまう。
    // 照合の前に試行枠を1つ atomically に消費し、その結果だけで通す・弾くを決める。
    const rateLimitKey = clientKeyFromHeaders(request.headers);
    const attempt = await reserveViewerLoginAttemptBoth(rateLimitKey);
    if (attempt.locked) {
      // しきい値を超えたことは記録に残す（気づけないまま試され続けるのを避ける）。
      // key は IP のハッシュなので、ログに生の IP は出ない。
      console.warn(`viewer login locked: key=${rateLimitKey} retryAfter=${attempt.retryAfterSeconds}s`);
      responseHeaders.set('retry-after', String(attempt.retryAfterSeconds));
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `too many failed attempts; retry after ${attempt.retryAfterSeconds}s`,
      });
    }

    const codeHash = createHash('sha256').update(input.code, 'utf-8').digest();
    const validHash = createHash('sha256').update(viewerCode, 'utf-8').digest();
    if (!timingSafeEqual(codeHash, validHash)) {
      // 枠は上で消費済みなので、ここで二重に数えない。
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'invalid viewer code' });
    }

    // 正しい相手を巻き込まないよう、成功したら記録を消す。
    await clearViewerLoginRateLimit(rateLimitKey);
    appendSessionCookie(responseHeaders);
    return { ok: true as const };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const { responseHeaders } = requireHttpMutationContext(ctx.request, ctx.responseHeaders);
    appendExpiredSessionCookie(responseHeaders);
    return { ok: true as const };
  }),
});
