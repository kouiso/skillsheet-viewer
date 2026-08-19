import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST } from './route';

const URL_STR = 'http://localhost:3000/api/auth';
const SAME_ORIGIN = { origin: 'http://localhost:3000', host: 'localhost:3000' };

function makeReq(body: string, headers: Record<string, string> = SAME_ORIGIN): NextRequest {
  return new NextRequest(URL_STR, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
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
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('POST /api/auth', () => {
  it('origin と host が不一致なら 403', async () => {
    const res = await POST(
      makeReq(JSON.stringify({ code: 'correct-code' }), { origin: 'http://evil.example', host: 'localhost:3000' }),
    );
    expect(res.status).toBe(403);
  });

  it('VIEWER_CODE 未設定なら 500', async () => {
    delete process.env.VIEWER_CODE;
    delete process.env.VITE_VIEWER_CODE;
    const res = await POST(makeReq(JSON.stringify({ code: 'x' })));
    expect(res.status).toBe(500);
  });

  it('不正な JSON body は 400', async () => {
    const res = await POST(makeReq('not-json'));
    expect(res.status).toBe(400);
  });

  it('code が文字列でなければ 400', async () => {
    const res = await POST(makeReq(JSON.stringify({ code: 123 })));
    expect(res.status).toBe(400);
  });

  it('誤ったコードは 401', async () => {
    const res = await POST(makeReq(JSON.stringify({ code: 'wrong-code' })));
    expect(res.status).toBe(401);
  });

  it('正しいコードは 200 で session cookie を発行する', async () => {
    const res = await POST(makeReq(JSON.stringify({ code: 'correct-code' })));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('session=');
    expect(res.cookies.get('session')?.value).toBeTruthy();
  });
});
