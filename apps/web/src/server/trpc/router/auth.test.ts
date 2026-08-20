import { MAX_FAILURES } from '@skillsheet/db/viewer-rate-limit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewerLoginRateLimitMemory } from '@/server/viewer-rate-limit';
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
  // 回数制限はプロセス内カウンタを持つため、テスト間で持ち越さない。
  resetViewerLoginRateLimitMemory();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
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
// 閲覧コードは共有の1本きりなので、回数制限が無いと総当たりで破れる
// （対策前は実測で毎秒 337 回通った）。
describe('閲覧コードの総当たり対策', () => {
  function attackerCaller() {
    return callerFor(
      new Request('https://example.com/api/trpc/auth.login', {
        method: 'POST',
        headers: { origin: 'https://example.com', host: 'example.com', 'x-forwarded-for': '203.0.113.9' },
      }),
    );
  }

  it(`照合できるのは ${MAX_FAILURES} 回までで、それを超えると TOO_MANY_REQUESTS になる`, async () => {
    for (let i = 1; i <= MAX_FAILURES; i++) {
      const { caller } = attackerCaller();
      await expect(caller.login({ code: `wrong-${i}` })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }

    const { caller, responseHeaders } = attackerCaller();
    await expect(caller.login({ code: 'wrong-last' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(responseHeaders?.get('retry-after')).toMatch(/^\d+$/);

    // ロック後は、たとえ正しいコードでも通さない（総当たりの当たりを拾わせない）。
    const { caller: after } = attackerCaller();
    await expect(after.login({ code: 'correct-code' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  // 並列に投げても、コード照合まで進めるのは上限回数までであること。
  it('同時に投げても照合まで進めるのは上限回数まで', async () => {
    const results = await Promise.all(
      Array.from({ length: MAX_FAILURES * 3 }, (_, i) =>
        attackerCaller()
          .caller.login({ code: `concurrent-${i}` })
          .then(() => 'ok')
          .catch((err: { code?: string }) => err.code ?? 'unknown'),
      ),
    );
    expect(results.filter((code) => code === 'UNAUTHORIZED')).toHaveLength(MAX_FAILURES);
    expect(results.filter((code) => code === 'TOO_MANY_REQUESTS')).toHaveLength(MAX_FAILURES * 2);
  });

  it('別の送り元は巻き込まれない', async () => {
    for (let i = 0; i <= MAX_FAILURES; i++) {
      const { caller } = attackerCaller();
      await caller.login({ code: `wrong-${i}` }).catch(() => {});
    }

    const { caller, responseHeaders } = callerFor(
      new Request('https://example.com/api/trpc/auth.login', {
        method: 'POST',
        headers: { origin: 'https://example.com', host: 'example.com', 'x-forwarded-for': '198.51.100.7' },
      }),
    );
    await expect(caller.login({ code: 'correct-code' })).resolves.toEqual({ ok: true });
    expect(responseHeaders?.has('set-cookie')).toBe(true);
  });

  it('成功すると失敗の記録が消え、次に間違えても即ロックにならない', async () => {
    const headers = { origin: 'https://example.com', host: 'example.com', 'x-forwarded-for': '192.0.2.55' };
    const make = () => callerFor(new Request('https://example.com/api/trpc/auth.login', { method: 'POST', headers }));

    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      await make()
        .caller.login({ code: `wrong-${i}` })
        .catch(() => {});
    }
    await expect(make().caller.login({ code: 'correct-code' })).resolves.toEqual({ ok: true });
    await expect(make().caller.login({ code: 'wrong-again' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
