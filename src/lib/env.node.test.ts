import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function fixture() {
  vi.resetModules();
  vi.stubEnv('NEXT_PHASE', '');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('SKILLSHEET_DB_BACKEND', 'd1');
  for (const key of [
    'SESSION_SECRET',
    'VIEWER_CODE',
    'BETTER_AUTH_SECRET',
    'SKILLSHEET_OWNER_ID',
    'D1_GATEWAY_SERVICE_TOKEN',
  ])
    vi.stubEnv(key, 'synthetic-placeholder-only');
  vi.stubEnv('D1_GATEWAY_URL', 'http://127.0.0.1:4200');
  vi.stubEnv('BETTER_AUTH_URL', 'http://127.0.0.1:4100');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return import('./env');
}

describe('D1とNeonの起動時必須設定', () => {
  it('D1はNeon接続文字列なしでUIを起動できる', async () => {
    const { assertServerEnv } = await fixture();
    expect(() => assertServerEnv()).not.toThrow();
  });

  it.each([
    'D1_GATEWAY_URL',
    'D1_GATEWAY_SERVICE_TOKEN',
    'BETTER_AUTH_URL',
  ])('D1で%sがない場合は明示的に拒否する', async (key) => {
    const { assertServerEnv } = await fixture();
    vi.stubEnv(key, '');
    expect(() => assertServerEnv()).toThrow(key);
  });

  it('従来のNeon経路はDATABASE_URLを引き続き必須にする', async () => {
    const { assertServerEnv } = await fixture();
    vi.stubEnv('SKILLSHEET_DB_BACKEND', 'neon');
    expect(() => assertServerEnv()).toThrow('DATABASE_URL');
  });
});
