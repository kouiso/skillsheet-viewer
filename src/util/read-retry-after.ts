import { TRPCClientError } from '@trpc/client';

/**
 * tRPC のエラーが運んできた HTTP 応答の `retry-after`（秒）を読む。
 * 締め出しの応答（TOO_MANY_REQUESTS）は、API が待ち時間をこのヘッダに入れて返す
 * （src/server/trpc/router/auth.ts）。ヘッダが無い・数として読めない・0 以下の時は null。
 */
export const readRetryAfterSeconds = (err: unknown): number | null => {
  if (!(err instanceof TRPCClientError)) return null;
  const response: unknown = err.meta?.response;
  if (typeof response !== 'object' || response === null || !('headers' in response)) return null;
  const headers = response.headers;
  if (typeof headers !== 'object' || headers === null || !('get' in headers) || typeof headers.get !== 'function') {
    return null;
  }
  const raw: unknown = headers.get('retry-after');
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};
