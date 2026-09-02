import type { Instrumentation } from 'next';

import { MISSING_SERVER_ENV_PREFIX } from '@/lib/env';
import { isSentryEnabled } from '@/lib/observability/config';
import { classifyConfigError } from '@/util/is-config-error';

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

/**
 * `assertServerEnv()` の欠落判定と `classifyConfigError()` は別文言なので両方見る。
 * どちらかに該当するエラーは「設定不備」＝待っても直らない原因なので、ここでは報告しない
 * （全リクエストで throw し続けて Sentry の無料枠を食い尽くす事故を防ぐ）。
 * 設定不備自体は `app/global-error.tsx` が warning レベルで別途1回だけ拾う。
 */
function isKnownConfigError(error: unknown): boolean {
  if (classifyConfigError(error) !== null) return true;
  return error instanceof Error && error.message.startsWith(MISSING_SERVER_ENV_PREFIX);
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!isSentryEnabled() || isKnownConfigError(error)) return;
  const Sentry = await import('@sentry/nextjs');
  await Sentry.captureRequestError(error, request, context);
};
