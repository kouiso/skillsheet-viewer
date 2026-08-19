import { createHash, timingSafeEqual } from 'node:crypto';

import { TRPCError } from '@trpc/server';

import { appendExpiredSessionCookie, appendSessionCookie } from '@/server/session';

import { publicProcedure, router } from '../init';
import { viewerLoginInputSchema } from '../schema';

export const VIEWER_AUTH_NOT_CONFIGURED_MESSAGE = 'viewer authentication is not configured';

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

  login: publicProcedure.input(viewerLoginInputSchema).mutation(({ ctx, input }) => {
    const { responseHeaders } = requireHttpMutationContext(ctx.request, ctx.responseHeaders);
    const viewerCode = process.env.VIEWER_CODE ?? process.env.VITE_VIEWER_CODE;
    if (!viewerCode) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: VIEWER_AUTH_NOT_CONFIGURED_MESSAGE });
    }

    const codeHash = createHash('sha256').update(input.code, 'utf-8').digest();
    const validHash = createHash('sha256').update(viewerCode, 'utf-8').digest();
    if (!timingSafeEqual(codeHash, validHash)) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'invalid viewer code' });
    }

    appendSessionCookie(responseHeaders);
    return { ok: true as const };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const { responseHeaders } = requireHttpMutationContext(ctx.request, ctx.responseHeaders);
    appendExpiredSessionCookie(responseHeaders);
    return { ok: true as const };
  }),
});
