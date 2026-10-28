import { afterEach, describe, expect, it, vi } from 'vitest';
import { d1OwnerAuxiliary, isD1Runtime } from './d1-runtime';

afterEach(() => vi.unstubAllEnvs());
describe('D1 runtimeの固定ownerとbackend設定', () => {
  it('補助操作でも期待ownerが違えば接続せず拒否', async () => {
    vi.stubEnv('SKILLSHEET_OWNER_ID', 'synthetic-owner');
    await expect(d1OwnerAuxiliary('other-owner', { operation: 'drive.read' })).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
  });
  it('不明backendをNeonへのfallbackとして扱わない', () => {
    vi.stubEnv('SKILLSHEET_DB_BACKEND', 'typo');
    expect(() => isD1Runtime()).toThrow('INVALID_GATEWAY_CONFIG');
  });
});
