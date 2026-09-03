/**
 * Sentry / PostHog のキルスイッチ。
 *
 * `process.env.NEXT_PUBLIC_*` は各関数の中で必ずリテラルのプロパティアクセスとして書くこと。
 * 変数越し（`process.env[key]`）にすると Next のビルド時インライン化が効かず、
 * クライアントバンドルに `process.env` オブジェクトそのものを持ち込もうとして壊れる。
 *
 * このモジュールは絶対にログを出さない。キルスイッチ自身が診断のノイズ源になってはいけない。
 */

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}

function isWebdriver(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

/**
 * `NEXT_PUBLIC_VERCEL_ENV` は Vercel のビルド時にのみ注入される（ローカル・CI では undefined）。
 * これ自体が「ローカル/CI では無効」というキルスイッチとして機能する
 * （ローカル e2e が本番 Neon に書いた事故と同じ機構を、ここで構造的に塞ぐ）。
 */
function isDeployEnvAllowed(): boolean {
  if (process.env.NEXT_PUBLIC_OBSERVABILITY_FORCE === '1') return true;
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV;
  return env === 'production' || env === 'preview';
}

export function isSentryEnabled(): boolean {
  if (isTestEnv() || isWebdriver()) return false;
  if (!isDeployEnvAllowed()) return false;
  return typeof process.env.NEXT_PUBLIC_SENTRY_DSN === 'string' && process.env.NEXT_PUBLIC_SENTRY_DSN.length > 0;
}

export function isPostHogEnabled(): boolean {
  if (isTestEnv() || isWebdriver()) return false;
  if (!isDeployEnvAllowed()) return false;
  return typeof process.env.NEXT_PUBLIC_POSTHOG_KEY === 'string' && process.env.NEXT_PUBLIC_POSTHOG_KEY.length > 0;
}

export function getSentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function getPostHogKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

export function getPostHogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
}
