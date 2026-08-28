import { cache } from 'react';

import { createTRPCContext } from './context';
import { createCallerFactory } from './init';
import { appRouter } from './router';

const createCaller = createCallerFactory(appRouter);

/**
 * RSC 用の server caller。HTTP を経由せず procedure を直接呼び出すため、
 * リクエスト往復なしで tRPC の型付き入出力（zod 検証・エラーコード）だけを得られる。
 * cache() でリクエスト単位にメモ化し、同一リクエスト内（例: generateMetadata と
 * ページ本体の両方から呼ばれる場合）の認証セッション参照の重複を防ぐ。
 */
export const createServerCaller = cache(async () => {
  const ctx = await createTRPCContext();
  return createCaller(ctx);
});
