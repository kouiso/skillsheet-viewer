/**
 * getAuth の OAuth init 耐故障化テスト（Issue #331, node 環境）。
 *
 * `0006` 未適用の DB では OAuth プラグイン init（`auth.$context` の解決）が
 * 例外になる。フォールバックが無いと `/api/auth/*` 全般が 500 化するため、
 * 失敗時はプラグイン無しで再構成されること、成功時はそのまま使われることを
 * betterAuth をモックして検証する。
 */
import { betterAuth } from 'better-auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

const betterAuthMock = vi.mocked(betterAuth);

vi.mock('better-auth', () => ({ betterAuth: vi.fn() }));
vi.mock('@/db', () => ({ createDb: vi.fn(() => ({})) }));
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: vi.fn(() => ({})) }));
vi.mock('better-auth/plugins', () => ({ jwt: vi.fn(() => ({ id: 'jwt' })) }));
vi.mock('@better-auth/mcp', () => ({ mcp: vi.fn(() => ({ id: 'mcp' })) }));
vi.mock('@better-auth/cimd', () => ({ cimd: vi.fn(() => ({ id: 'cimd' })) }));
vi.mock('@better-auth/cimd/node', () => ({ fetchClientMetadataResource: vi.fn() }));

function stubEnv() {
  vi.stubEnv('DATABASE_URL', 'postgres://x');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  vi.stubEnv('SKILLSHEET_OWNER_ID', 'owner-1');
  vi.stubEnv('MCP_ENABLED', 'true');
  vi.stubEnv('MCP_RESOURCE_URL', 'https://example.test/api/mcp');
}

function fakeAuth(context: Promise<unknown>) {
  return { $context: context } as unknown as ReturnType<typeof betterAuth>;
}

async function importFresh() {
  vi.resetModules();
  return import('./auth');
}

afterEach(() => {
  vi.unstubAllEnvs();
  betterAuthMock.mockReset();
});

describe('getAuth の OAuth init フォールバック', () => {
  it('init 成功時は OAuth プラグイン付きの auth がそのまま使われる', async () => {
    stubEnv();
    betterAuthMock.mockImplementation(() => fakeAuth(Promise.resolve({})));
    const { getAuth, isMcpOauthReady } = await importFresh();

    const auth = await getAuth();
    expect(auth).toBeTruthy();
    expect(isMcpOauthReady()).toBe(true);
    expect(betterAuthMock).toHaveBeenCalledTimes(1);
    expect(betterAuthMock.mock.calls[0][0].plugins).toHaveLength(3);
  });

  it('init 失敗時はプラグイン無しで再構成し isMcpOauthReady は false', async () => {
    stubEnv();
    betterAuthMock
      .mockImplementationOnce(() => fakeAuth(Promise.reject(new Error('relation "oauth_resource" does not exist'))))
      .mockImplementationOnce(() => fakeAuth(Promise.resolve({})));
    const { getAuth, isMcpOauthReady } = await importFresh();

    const auth = await getAuth();
    expect(auth).toBeTruthy();
    expect(isMcpOauthReady()).toBe(false);
    expect(betterAuthMock).toHaveBeenCalledTimes(2);
    expect(betterAuthMock.mock.calls[1][0].plugins).toHaveLength(0);
  });

  it('MCP 無効環境ではプラグイン無しで1回だけ構築される', async () => {
    stubEnv();
    vi.stubEnv('MCP_ENABLED', 'false');
    betterAuthMock.mockImplementation(() => fakeAuth(Promise.resolve({})));
    const { getAuth, isMcpOauthReady } = await importFresh();

    await getAuth();
    expect(isMcpOauthReady()).toBe(false);
    expect(betterAuthMock).toHaveBeenCalledTimes(1);
    expect(betterAuthMock.mock.calls[0][0].plugins).toHaveLength(0);
  });
});
