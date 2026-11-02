import { describe, expect, it, vi } from 'vitest';
import { createCimdTransport } from '../../worker/cimd-transport';
import { createCimdNodeHandler } from './d1-cimd';

const service = 'synthetic-service-placeholder-only';
const endpoint = 'https://node.synthetic.invalid/api/d1/cimd';
const request = (body: unknown, token = service) =>
  new Request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-skillsheet-service-token': token },
    body: JSON.stringify(body),
  });

describe('CIMDのWorkers→限定Node transport境界', () => {
  it('公式transportへGET/HEADとAcceptだけを渡し、サービス資格情報をmetadata hostへ渡さない', async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        client_id: 'https://client.synthetic.invalid/metadata',
        redirect_uris: ['https://client.synthetic.invalid/callback'],
      }),
    );
    const handler = createCimdNodeHandler(service, upstream);
    const bridge = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init)));
    const fetchMetadata = createCimdTransport(endpoint, service, ['https://node.synthetic.invalid'], bridge);
    const result = await fetchMetadata('https://client.synthetic.invalid/metadata', {
      headers: { authorization: 'must-not-forward', cookie: 'must-not-forward' },
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ client_id: 'https://client.synthetic.invalid/metadata' });
    expect(upstream.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' });
    expect([...upstream.mock.calls[0][1].headers.entries()]).toEqual([['accept', 'application/json']]);
    expect(JSON.stringify(upstream.mock.calls)).not.toContain(service);
    expect(bridge.mock.calls[0][1]?.redirect).toBe('error');
  });
  it('conditional validatorと304のcache metadataを保持する', async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 304, headers: { etag: '"synthetic"', 'cache-control': 'max-age=60' } }),
      );
    const handler = createCimdNodeHandler(service, upstream);
    const fetchMetadata = createCimdTransport(
      endpoint,
      service,
      ['https://node.synthetic.invalid'],
      async (input, init) => handler(new Request(input, init)),
    );
    const response = await fetchMetadata('https://client.synthetic.invalid/metadata', {
      headers: { 'if-none-match': '"synthetic"' },
    });
    expect(response.status).toBe(304);
    expect(response.headers.get('cache-control')).toBe('max-age=60');
    expect(upstream.mock.calls[0][1].headers.get('if-none-match')).toBe('"synthetic"');
    expect(await response.text()).toBe('');
  });
  it('未認証・SQL/owner余分引数・非HTTPS・credential URL・変更methodを拒否', async () => {
    const upstream = vi.fn();
    const handler = createCimdNodeHandler(service, upstream);
    expect(
      (await handler(request({ operation: 'metadata.fetch', url: 'https://client.invalid', method: 'GET' }, 'bad')))
        .status,
    ).toBe(403);
    for (const body of [
      { operation: 'execute', sql: 'select 1' },
      { operation: 'metadata.fetch', url: 'https://client.invalid', method: 'GET', owner: 'attacker' },
      { operation: 'metadata.fetch', url: 'http://client.invalid', method: 'GET' },
      { operation: 'metadata.fetch', url: 'https://name:password@client.invalid', method: 'GET' },
      { operation: 'metadata.fetch', url: 'https://client.invalid', method: 'POST' },
    ])
      expect((await handler(request(body))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('公式Node transportがloopback IPを拒否し、外部通信をしない', async () => {
    const response = await createCimdNodeHandler(service)(
      request({ operation: 'metadata.fetch', url: 'https://127.0.0.1/metadata', method: 'GET' }),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('127.0.0.1');
  });
  it('redirect・巨大response・巨大requestを拒否', async () => {
    const input = { operation: 'metadata.fetch', url: 'https://client.invalid', method: 'GET' };
    expect(
      (
        await createCimdNodeHandler(
          service,
          vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://127.0.0.1' } })),
        )(request(input))
      ).status,
    ).toBe(502);
    expect(
      (
        await createCimdNodeHandler(
          service,
          vi.fn().mockResolvedValue(new Response('x'.repeat(131073))),
        )(request(input))
      ).status,
    ).toBe(502);
    expect((await createCimdNodeHandler(service)(request({ ...input, url: 'x'.repeat(9000) }))).status).toBe(413);
  });
  it('Node境界のorigin/path allowlistを維持する', () => {
    for (const target of [
      'https://attacker.invalid/api/d1/cimd',
      'https://node.synthetic.invalid/execute',
      'http://node.synthetic.invalid/api/d1/cimd',
    ]) {
      expect(() => createCimdTransport(target, service, ['https://node.synthetic.invalid'])).toThrow(
        'INVALID_CIMD_TRANSPORT',
      );
    }
  });
});
