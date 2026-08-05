import { createTRPCContext } from './context';
import { createCallerFactory } from './init';
import { appRouter } from './router';

const createCaller = createCallerFactory(appRouter);

/**
 * RSC 用の server caller。HTTP を経由せず procedure を直接呼び出すため、
 * リクエスト往復なしで tRPC の型付き入出力（zod 検証・エラーコード）だけを得られる。
 */
export async function createServerCaller() {
  const ctx = await createTRPCContext();
  return createCaller(ctx);
}
