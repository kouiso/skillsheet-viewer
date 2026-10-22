/** Node側の公式DNS pinning transportだけに委譲し、Workersのplain fetchで代替しない。 */
export function createCimdTransport(
  endpoint: string,
  serviceToken: string,
  origins: string[],
  fetcher = fetch,
): typeof fetch {
  const target = new URL(endpoint);
  if (
    target.pathname !== '/api/d1/cimd' ||
    target.search ||
    target.hash ||
    target.username ||
    target.password ||
    !origins.includes(target.origin) ||
    (target.protocol !== 'https:' &&
      !(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)))
  )
    throw new Error('INVALID_CIMD_TRANSPORT');
  return async (input, init) => {
    const source = new Request(input, init);
    if (!['GET', 'HEAD'].includes(source.method)) throw new Error('INVALID_CIMD_METHOD');
    const response = await fetcher(target, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
      headers: { 'content-type': 'application/json', 'x-skillsheet-service-token': serviceToken },
      body: JSON.stringify({
        operation: 'metadata.fetch',
        url: source.url,
        method: source.method,
        validators: {
          etag: source.headers.get('if-none-match') ?? undefined,
          modified: source.headers.get('if-modified-since') ?? undefined,
        },
      }),
    });
    if (!response.ok) throw new Error('CIMD_TRANSPORT_FAILED');
    const raw = await response.text();
    if (raw.length > 1048576) throw new Error('CIMD_TRANSPORT_FAILED');
    const result: unknown = JSON.parse(raw);
    if (
      !result ||
      typeof result !== 'object' ||
      !('status' in result) ||
      typeof result.status !== 'number' ||
      !('body' in result) ||
      typeof result.body !== 'string' ||
      !('contentType' in result) ||
      !(typeof result.contentType === 'string' || result.contentType === null)
    )
      throw new Error('CIMD_TRANSPORT_FAILED');
    const responseHeaders = new Headers(result.contentType ? { 'content-type': result.contentType } : {});
    if ('cacheHeaders' in result && result.cacheHeaders && typeof result.cacheHeaders === 'object') {
      for (const [key, value] of Object.entries(result.cacheHeaders)) {
        if (
          ['cache-control', 'expires', 'etag', 'last-modified', 'date', 'age'].includes(key) &&
          typeof value === 'string'
        )
          responseHeaders.set(key, value);
      }
    }
    return new Response(source.method === 'HEAD' || [204, 205, 304].includes(result.status) ? null : result.body, {
      status: result.status,
      headers: responseHeaders,
    });
  };
}
