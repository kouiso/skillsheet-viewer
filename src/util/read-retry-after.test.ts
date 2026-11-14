import { TRPCClientError } from '@trpc/client';
import { describe, expect, it } from 'vitest';
import { readRetryAfterSeconds } from './read-retry-after';

const errorWithHeaders = (headers: Record<string, string>) =>
  new TRPCClientError('too many', { meta: { response: new Response(null, { status: 429, headers }) } });

describe('readRetryAfterSeconds', () => {
  it('retry-after の秒数を読む', () => {
    expect(readRetryAfterSeconds(errorWithHeaders({ 'retry-after': '840' }))).toBe(840);
  });

  it('小数は切り上げる', () => {
    expect(readRetryAfterSeconds(errorWithHeaders({ 'retry-after': '0.4' }))).toBe(1);
  });

  it('ヘッダが無い・空・数でない・0 以下なら null', () => {
    expect(readRetryAfterSeconds(errorWithHeaders({}))).toBeNull();
    expect(readRetryAfterSeconds(errorWithHeaders({ 'retry-after': ' ' }))).toBeNull();
    expect(readRetryAfterSeconds(errorWithHeaders({ 'retry-after': 'soon' }))).toBeNull();
    expect(readRetryAfterSeconds(errorWithHeaders({ 'retry-after': '0' }))).toBeNull();
    expect(readRetryAfterSeconds(errorWithHeaders({ 'retry-after': '-5' }))).toBeNull();
  });

  it('応答を持たないエラーや tRPC 以外のエラーは null', () => {
    expect(readRetryAfterSeconds(new TRPCClientError('no response'))).toBeNull();
    expect(readRetryAfterSeconds(new Error('x'))).toBeNull();
    expect(readRetryAfterSeconds(undefined)).toBeNull();
  });
});
