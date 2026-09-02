import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPostHogHost, isPostHogEnabled, isSentryEnabled } from './config';

/**
 * config.ts は `process.env.NEXT_PUBLIC_*` を関数の中で毎回リテラル参照している
 * （トップレベル定数にキャッシュしていない）ので、テストごとに `vi.stubEnv` で書き換えれば
 * モジュールの再 import なしに検証できる。`NODE_ENV` は `@types/node` 上 readonly なので
 * 直接代入できず、`vi.stubEnv` を使う必要がある。
 *
 * vitest は既定で `NODE_ENV=test` を注入する。デプロイ環境ゲート単体を検証するテストは
 * `NODE_ENV` を明示的に 'production' 相当へ上書きして、test-env ゲートと deploy-env ゲートの
 * 2つが混ざらないようにする（NODE_ENV=test ゲート自体は専用テストで確認する）。
 *
 * `process.env.NEXT_PUBLIC_*` はビルド時に文字列インライン化される（Next の仕様）ため、
 * ここでの真理値表は「ロジックが正しいか」の保証であって、本番ビルドでの実際の無効化を
 * 保証しない。本番相当の保証は動作確認手順（DevTools 目視）で行う。
 */
describe('observability config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DSN があっても NEXT_PUBLIC_VERCEL_ENV が無ければ無効', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://example.invalid/1');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_OBSERVABILITY_FORCE', '');
    expect(isSentryEnabled()).toBe(false);
  });

  it('production かつ DSN ありなら有効', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://example.invalid/1');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    expect(isSentryEnabled()).toBe(true);
  });

  it('preview かつ DSN ありなら有効', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://example.invalid/1');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    expect(isSentryEnabled()).toBe(true);
  });

  it('development では FORCE=1 が無い限り無効', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://example.invalid/1');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_OBSERVABILITY_FORCE', '');
    expect(isSentryEnabled()).toBe(false);
  });

  it('FORCE=1 なら deploy env ゲートを迂回する（ローカル検証用）', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://example.invalid/1');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_OBSERVABILITY_FORCE', '1');
    expect(isSentryEnabled()).toBe(true);
  });

  it('DSN が空文字なら production でも無効', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    expect(isSentryEnabled()).toBe(false);
  });

  it('PostHog も同じゲートを共有する', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    expect(isPostHogEnabled()).toBe(true);
  });

  it('NODE_ENV=test では FORCE=1 かつ production 相当でも常に無効', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://example.invalid/1');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_OBSERVABILITY_FORCE', '1');
    expect(isSentryEnabled()).toBe(false);
  });

  it('getPostHogHost は未設定時に既定ホストを返す', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '');
    expect(getPostHogHost()).toBe('https://us.i.posthog.com');
  });
});
