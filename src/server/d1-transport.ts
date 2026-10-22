import type { GatewayOperation } from '../db/d1/contract';
import { DocumentError } from '../db/document-service';

export interface D1TransportOptions {
  endpoint: string;
  serviceToken: string;
  appOrigin: string;
  fetch?: typeof fetch;
}

/** 応答喪失時は自動再送しない。mutateの結果不明は再読取で確認する。 */
export function createD1Transport(options: D1TransportOptions) {
  const endpoint = new URL(options.endpoint);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/')
    throw new DocumentError('INVALID_GATEWAY_CONFIG');
  if (
    endpoint.protocol !== 'https:' &&
    !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))
  )
    throw new DocumentError('INVALID_GATEWAY_CONFIG');
  if (!options.serviceToken || new URL(options.appOrigin).origin !== options.appOrigin)
    throw new DocumentError('INVALID_GATEWAY_CONFIG');
  const fetcher = options.fetch ?? fetch;
  function authHeaders(source: Headers) {
    const headers = new Headers({
      'x-skillsheet-service-token': options.serviceToken,
      'x-skillsheet-app-origin': options.appOrigin,
    });
    // 利用者の証明はcookie/bearerだけ。user/owner/roleなどの自己申告ヘッダーは運ばない。
    for (const key of ['cookie', 'authorization', 'dpop', 'origin', 'user-agent', 'accept', 'mcp-protocol-version']) {
      const value = source.get(key);
      if (value) headers.set(key, value);
    }
    return headers;
  }
  async function operation(request: GatewayOperation, source: Headers): Promise<unknown> {
    const headers = authHeaders(source);
    headers.set('content-type', 'application/json');
    let response: Response;
    try {
      response = await fetcher(new URL('/v1/operation', endpoint), {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        cache: 'no-store',
        // workerdはredirect:errorを実装しない。転送を追わず、下で3xxを結果不明として止める。
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new DocumentError('GATEWAY_OUTCOME_UNKNOWN');
    }
    if (response.status >= 300 && response.status < 400) throw new DocumentError('GATEWAY_OUTCOME_UNKNOWN');
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DocumentError('GATEWAY_OUTCOME_UNKNOWN');
    }
    if (body === null || typeof body !== 'object') throw new DocumentError('INVALID_DB_RESPONSE');
    if (!response.ok) {
      const error = 'error' in body ? body.error : undefined;
      const allowed = [
        'ACCESS_DENIED',
        'CONFLICT',
        'NOT_FOUND',
        'INVALID_REQUEST',
        'INVALID_STATE',
        'UNEDITABLE_DOCUMENT',
        'UNREADABLE_DOCUMENT',
        'VISIBILITY_CONFIRMATION_REQUIRED',
        'ALREADY_CURRENT',
        'PAYLOAD_TOO_LARGE',
      ];
      throw new DocumentError(typeof error === 'string' && allowed.includes(error) ? error : 'INVALID_DB_RESPONSE');
    }
    if (!Object.hasOwn(body, 'result')) throw new DocumentError('INVALID_DB_RESPONSE');
    return (body as { result: unknown }).result;
  }
  async function auth(request: Request) {
    const sourceUrl = new URL(request.url);
    if (
      !sourceUrl.pathname.startsWith('/api/auth/') &&
      ![
        '/api/mcp',
        '/.well-known/oauth-protected-resource/api/mcp',
        '/.well-known/oauth-authorization-server/api/auth',
      ].includes(sourceUrl.pathname)
    )
      throw new DocumentError('INVALID_REQUEST');
    const headers = authHeaders(request.headers);
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const response = await fetcher(new URL(sourceUrl.pathname + sourceUrl.search, endpoint), {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    // Node fetchが伸長済みの本文をNextから再配信する。元のgzip/長さを残すと二重伸長で壊れる。
    const responseHeaders = new Headers(response.headers);
    for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'connection'])
      responseHeaders.delete(name);
    responseHeaders.set('cache-control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }
  return { operation, auth };
}
