import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST, shouldLogTRPCError } from './route';

describe('shouldLogTRPCError', () => {
  it.each([
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
  ])('%s は procedure 側で意図的に投げる想定内の分岐のためログしない', (code) => {
    expect(shouldLogTRPCError(code)).toBe(false);
  });

  it.each(['BAD_REQUEST', 'INTERNAL_SERVER_ERROR', 'TIMEOUT'])('%s は想定外のエラーのためログする', (code) => {
    expect(shouldLogTRPCError(code)).toBe(true);
  });
});

describe('POST /api/trpc', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('httpBatchLink 形式の auth.login が Set-Cookie を返す', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-session-secret');
    vi.stubEnv('VIEWER_CODE', 'correct-code');
    const req = new Request('http://localhost:3000/api/trpc/auth.login?batch=1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({ 0: { json: { code: 'correct-code' } } }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('session=');
    const body = (await res.json()) as Array<{ result?: { data?: { json?: unknown } } }>;
    expect(body[0]?.result?.data?.json).toEqual({ ok: true });
  });

  // onError の結線自体（handler の生成物）は shouldLogTRPCError の純関数テストだけでは
  // 検証できない。実際に fetchRequestHandler を通し、想定内/想定外それぞれで
  // console.error の呼び出し有無を固定する。
  it('UNAUTHORIZED（想定内）は console.error を呼ばない', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('SESSION_SECRET', 'test-session-secret');
    vi.stubEnv('VIEWER_CODE', 'correct-code');
    const req = new Request('http://localhost:3000/api/trpc/auth.login?batch=1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({ 0: { json: { code: 'wrong-code' } } }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('BAD_REQUEST（zod 検証失敗・想定外）は console.error を呼ぶ', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = new Request('http://localhost:3000/api/trpc/auth.login?batch=1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      // code は必須の string だが未指定 → zod 検証失敗で BAD_REQUEST
      body: JSON.stringify({ 0: { json: {} } }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('auth.login'), expect.anything());
    consoleErrorSpy.mockRestore();
  });
});
