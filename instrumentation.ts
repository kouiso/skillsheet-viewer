import type { Instrumentation } from 'next';

import { isSentryEnabled } from '@/lib/observability/config';
import { isKnownConfigError } from '@/server/known-config-error';

/**
 * nodejs runtime かつキルスイッチが通っているときだけ `sentry.server.config` を読み込む。
 * edge runtime（proxy.ts）はここでは対象外（`sentry.edge.config.ts` は意図的に作っていない — 5行の
 * ヘッダーコピーだけの edge コードのために追加の設定ファイルを持つ価値が薄いため）。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && isSentryEnabled()) {
    await import('./sentry.server.config');
  }
}

// 設定不備（待っても直らない原因）は報告しない。判定は `src/server/known-config-error.ts` に
// 集約してあり、`report-error.ts` と同じ関数を使う（2か所に分けると文言の追加が片方に漏れる）。
// 設定不備自体は `app/global-error.tsx` が warning レベルで別途1回だけ拾う。
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!isSentryEnabled() || isKnownConfigError(error)) return;
  const Sentry = await import('@sentry/nextjs');
  await Sentry.captureRequestError(error, request, context);
};
