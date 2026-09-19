import { initTRPC, TRPCError } from '@trpc/server';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';
import superjson from 'superjson';

import type { TRPCContext } from './context';

// savedUpdatedAt 等の Date が server caller（RSC）と HTTP（クライアント）の両経路で
// 同じ型（Date）のまま渡るよう superjson を必須にする。無いと HTTP 経路だけ string に
// なり、楽観ロックの .getTime() 比較がエラーなく壊れる（サイレント劣化）。
const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  // 内部例外の message（DB エラーのクエリ文・設定不備・内部コード名等）が公開 JSON に
  // そのまま出るのを防ぐ（#350）。INTERNAL_SERVER_ERROR は一律汎用文へ置き換え、
  // 内部の詳細は onError のサーバログだけに残す。
  errorFormatter({ shape }) {
    if (shape.code === TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR) {
      return { ...shape, message: 'サーバー内部でエラーが発生しました' };
    }
    return shape;
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** 閲覧可（HMAC 閲覧 cookie または編集者セッション）のみ通す。 */
export const viewerProcedure = t.procedure.use(async ({ ctx, next }) => {
  const isViewer = await ctx.getIsViewer();
  if (!isViewer) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'viewer authentication required' });
  }
  return next({ ctx: { ...ctx, isViewer } });
});

/** 編集者（Better Auth セッション + SKILLSHEET_OWNER_ID 一致）のみ通す。 */
export const editorProcedure = t.procedure.use(async ({ ctx, next }) => {
  const editorUserId = await ctx.getEditorUserId();
  if (!editorUserId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'editor authentication required' });
  }
  return next({ ctx: { ...ctx, editorUserId } });
});
