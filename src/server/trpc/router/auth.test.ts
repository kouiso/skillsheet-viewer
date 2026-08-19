import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCallerFactory } from '../init';
import { createTestContext } from '../test-context';
import { authRouter } from './auth';

const createCaller = createCallerFactory(authRouter);

function callerFor(request: Request | null, responseHeaders: Headers | null = request ? new Headers() : null) {
  return {
    caller: createCaller(
      createTestContext({
        editorUserId: null,
        isViewer: false,
        request,
        responseHeaders,
      }),
    ),
    responseHeaders,
  };
}

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    VIEWER_CODE: process.env.VIEWER_CODE,
    VITE_VIEWER_CODE: process.env.VITE_VIEWER_CODE,
  };
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.VIEWER_CODE = 'correct-code';
  delete process.env.VITE_VIEWER_CODE;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('auth.status', () => {
  it('context の閲覧・編集権限だけを公開する', async () => {
    const caller = createCaller(
      createTestContext({
        editorUserId: 'owner',
        isViewer: true,
        request: null,
        responseHeaders: null,
      }),
    );
    await expect(caller.status()).resolves.toEqual({ canEdit: true, canView: true });
  });
});

describe('auth.login', () => {
  it('正しいコードなら署名 cookie を response headers へ追加する', async () => {
    const request = new Request('http://localhost:3000/api/trpc/auth.login', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    });
    const { caller, responseHeaders } = callerFor(request);

    await expect(caller.login({ code: 'correct-code' })).resolves.toEqual({ ok: true });
    expect(responseHeaders?.get('set-cookie')).toContain('session=');
    expect(responseHeaders?.get('set-cookie')).toContain('HttpOnly');
    expect(responseHeaders?.get('set-cookie')).toContain('SameSite=Strict');
  });

  it('origin と host が不一致なら FORBIDDEN で cookie を発行しない', async () => {
    const request = new Request('http://localhost:3000/api/trpc/auth.login', {
      method: 'POST',
      headers: { origin: 'https://evil.example', host: 'localhost:3000' },
    });
    const { caller, responseHeaders } = callerFor(request);

    await expect(caller.login({ code: 'correct-code' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(responseHeaders?.has('set-cookie')).toBe(false);
  });

  it('誤ったコードは UNAUTHORIZED で cookie を発行しない', async () => {
    const request = new Request('http://localhost:3000/api/trpc/auth.login', { method: 'POST' });
    const { caller, responseHeaders } = callerFor(request);

    await expect(caller.login({ code: 'wrong-code' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(responseHeaders?.has('set-cookie')).toBe(false);
  });

  it('VIEWER_CODE 未設定は INTERNAL_SERVER_ERROR', async () => {
    delete process.env.VIEWER_CODE;
    delete process.env.VITE_VIEWER_CODE;
    const request = new Request('http://localhost:3000/api/trpc/auth.login', { method: 'POST' });
    const { caller } = callerFor(request);

    await expect(caller.login({ code: 'x' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('HTTP response context が無い server caller からは実行できない', async () => {
    const { caller } = callerFor(null);
    await expect(caller.login({ code: 'correct-code' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});

describe('auth.logout', () => {
  it('同一 origin の HTTP 経路で閲覧 cookie を失効させる', async () => {
    const request = new Request('http://localhost:3000/api/trpc/auth.logout', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    });
    const { caller, responseHeaders } = callerFor(request);

    await expect(caller.logout()).resolves.toEqual({ ok: true });
    expect(responseHeaders?.get('set-cookie')).toContain('session=; Max-Age=0');
  });
});
