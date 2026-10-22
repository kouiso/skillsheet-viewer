import { describe, expect, it, vi } from 'vitest';
import { createD1Transport } from './d1-transport';

const config = {
  endpoint: 'https://gateway.invalid/',
  serviceToken: 'synthetic-service-placeholder',
  appOrigin: 'https://app.invalid',
};

describe('D1共通接続の送受信契約', () => {
  it('redirect/キャッシュ/自動再送を止め、owner headerを運ばない', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ result: { status: 'EMPTY' } }));
    const client = createD1Transport({ ...config, fetch: fetcher });
    await expect(
      client.operation(
        { operation: 'read', sheetId: null },
        new Headers({ cookie: 'synthetic=cookie', 'x-owner-id': 'attacker' }),
      ),
    ).resolves.toEqual({ status: 'EMPTY' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url.href).toBe('https://gateway.invalid/v1/operation');
    expect(init).toMatchObject({ redirect: 'error', cache: 'no-store' });
    expect(init.headers.get('x-owner-id')).toBeNull();
    expect(init.headers.get('cookie')).toBe('synthetic=cookie');
    expect(init.headers.get('x-skillsheet-service-token')).toBe(config.serviceToken);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('mutateの応答喪失は結果不明として1回で止める', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('synthetic network loss'));
    const client = createD1Transport({ ...config, fetch: fetcher });
    await expect(
      client.operation(
        { operation: 'delete', sheetId: '10000000-0000-4000-8000-000000000001', expectedRevision: '9007199254740993' },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'GATEWAY_OUTCOME_UNKNOWN' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('内部SQL/本文を含み得るエラーをそのまま公開しない', async () => {
    const client = createD1Transport({
      ...config,
      fetch: vi.fn().mockResolvedValue(Response.json({ error: 'SELECT private_body FROM secrets' }, { status: 500 })),
    });
    await expect(client.operation({ operation: 'list' }, new Headers())).rejects.toMatchObject({
      code: 'INVALID_DB_RESPONSE',
    });
  });
  it('認証プロキシは伸長済み本文のencodingを除きcookieを保つ', async () => {
    const upstream = new Response('{"ok":true}', {
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': '999',
        'set-cookie': 'synthetic=cookie; HttpOnly',
      },
    });
    const client = createD1Transport({ ...config, fetch: vi.fn().mockResolvedValue(upstream) });
    const result = await client.auth(new Request('https://app.invalid/api/auth/get-session'));
    expect(result.headers.get('content-encoding')).toBeNull();
    expect(result.headers.get('content-length')).toBeNull();
    expect(result.headers.get('set-cookie')).toBe('synthetic=cookie; HttpOnly');
    expect(await result.json()).toEqual({ ok: true });
  });
  it('任意origin、平文の外部接続、credential付きURLを拒否', () => {
    for (const endpoint of [
      'http://gateway.invalid/',
      'https://gateway.invalid/path',
      'https://name:password@gateway.invalid/',
      'https://gateway.invalid/?token=x',
    ]) {
      expect(() => createD1Transport({ ...config, endpoint })).toThrow('INVALID_GATEWAY_CONFIG');
    }
  });
});
