import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return { ...actual, revalidateTag };
});

describe('POST /api/revalidate', () => {
  afterEach(() => {
    revalidateTag.mockClear();
    vi.unstubAllEnvs();
  });

  it('revalidateTag を { expire: 0 } 付きで sheets と db-sheet の両方に呼ぶ（空の {} は即時失効を保証せず本番で無効化されない不具合があった）', async () => {
    vi.stubEnv('REVALIDATE_SECRET', 'test-secret');
    const req = new NextRequest('https://example.com/api/revalidate', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenNthCalledWith(1, 'sheets', { expire: 0 });
    expect(revalidateTag).toHaveBeenNthCalledWith(2, 'db-sheet', { expire: 0 });
    await expect(res.json()).resolves.toEqual({ ok: true, revalidated: ['sheets', 'db-sheet'] });
  });

  it('secret が不一致なら 401 を返し revalidateTag を呼ばない', async () => {
    vi.stubEnv('REVALIDATE_SECRET', 'test-secret');
    const req = new NextRequest('https://example.com/api/revalidate', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('REVALIDATE_SECRET 未設定なら 500 を返し、原因を断定しない本文を返す', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('REVALIDATE_SECRET', '');
    const req = new NextRequest('https://example.com/api/revalidate', {
      method: 'POST',
      headers: { authorization: 'Bearer anything' },
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Failed to revalidate' });
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('POST /api/revalidate: unexpected error:', expect.anything());
    consoleErrorSpy.mockRestore();
  });
});
