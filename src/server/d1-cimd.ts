import { createHash, timingSafeEqual } from 'node:crypto';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { z } from 'zod';

const requestSchema = z.strictObject({
  operation: z.literal('metadata.fetch'),
  url: z.url().max(4096),
  method: z.enum(['GET', 'HEAD']),
  validators: z
    .strictObject({ etag: z.string().max(1024).optional(), modified: z.string().max(128).optional() })
    .optional(),
});
const equal = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/** Workers未対応のDNS pinningを既存Node deploymentで行う、サービス専用の限定操作。 */
export function createCimdNodeHandler(serviceToken: string, fetcher = fetchClientMetadataResource) {
  return async (request: Request): Promise<Response> => {
    const fail = (status: number) =>
      Response.json({ error: 'METADATA_FETCH_DENIED' }, { status, headers: { 'cache-control': 'no-store' } });
    if (!serviceToken || !equal(request.headers.get('x-skillsheet-service-token') ?? '', serviceToken))
      return fail(403);
    if (request.method !== 'POST' || request.headers.get('content-type') !== 'application/json') return fail(415);
    // streamも制限し、偽のContent-Lengthで無制限bufferしない。
    const reader = request.body?.getReader();
    if (!reader) return fail(400);
    let text = '',
      bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 8192) {
          await reader.cancel();
          return fail(413);
        }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
      const parsed = requestSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return fail(400);
      const url = new URL(parsed.data.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) return fail(400);
      const metadataHeaders = new Headers({ accept: 'application/json' });
      if (parsed.data.validators?.etag) metadataHeaders.set('if-none-match', parsed.data.validators.etag);
      if (parsed.data.validators?.modified) metadataHeaders.set('if-modified-since', parsed.data.validators.modified);
      const response = await fetcher(url.href, {
        method: parsed.data.method,
        headers: metadataHeaders,
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (response.status >= 300 && response.status < 400 && response.status !== 304) return fail(502);
      const bodyReader = response.body?.getReader();
      let body = '',
        size = 0;
      const bodyDecoder = new TextDecoder();
      if (bodyReader)
        while (true) {
          const part = await bodyReader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 131072) {
            await bodyReader.cancel();
            return fail(502);
          }
          body += bodyDecoder.decode(part.value, { stream: true });
        }
      body += bodyDecoder.decode();
      return Response.json(
        {
          status: response.status,
          contentType: response.headers.get('content-type'),
          cacheHeaders: Object.fromEntries(
            ['cache-control', 'expires', 'etag', 'last-modified', 'date', 'age'].flatMap((key) => {
              const value = response.headers.get(key);
              return value === null ? [] : [[key, value]];
            }),
          ),
          body,
        },
        { headers: { 'cache-control': 'no-store' } },
      );
    } catch {
      return fail(502);
    }
  };
}
