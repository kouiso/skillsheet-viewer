import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';

import type { TRPCContext } from './context';

// savedUpdatedAt 等の Date が server caller（RSC）と HTTP（クライアント）の両経路で
// 同じ型（Date）のまま渡るよう superjson を必須にする。無いと HTTP 経路だけ string に
// なり、楽観ロックの .getTime() 比較がエラーなく壊れる（サイレント劣化）。
const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** 閲覧可（HMAC 閲覧 cookie または編集者セッション）のみ通す。 */
export const viewerProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.isViewer) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'viewer authentication required' });
  }
  return next({ ctx });
});

/** 編集者（Better Auth セッション + SKILLSHEET_OWNER_ID 一致）のみ通す。 */
export const editorProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.editorUserId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'editor authentication required' });
  }
  return next({ ctx: { ...ctx, editorUserId: ctx.editorUserId } });
});
