import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const appendExpiredSessionCookie = vi.hoisted(() => vi.fn());
vi.mock('@/server/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/session')>();
  appendExpiredSessionCookie.mockImplementation(actual.appendExpiredSessionCookie);
  return { ...actual, appendExpiredSessionCookie };
});

import { POST } from './route';

afterEach(() => {
  appendExpiredSessionCookie.mockClear();
});

describe('POST /api/logout compatibility adapter', () => {
  it('auth.logout の cookie 失効ヘッダーをそのまま返す', async () => {
    const req = new NextRequest('http://localhost:3000/api/logout', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(res.headers.get('set-cookie')).toContain('session=; Max-Age=0');
  });

  it('cross-origin request は 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/logout', {
      method: 'POST',
      headers: { origin: 'https://evil.example', host: 'localhost:3000' },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('想定外のエラーは 500 を返し console.error でログする（互換アダプタの catch は元々何もログしていなかった）', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    appendExpiredSessionCookie.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const req = new NextRequest('http://localhost:3000/api/logout', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Failed to log out' });
    expect(consoleErrorSpy).toHaveBeenCalledWith('POST /api/logout: unexpected error:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});
