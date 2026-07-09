import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }));

describe('POST /api/revalidate', () => {
  afterEach(() => {
    revalidateTag.mockClear();
    vi.unstubAllEnvs();
  });

  it('revalidateTag を { expire: 0 } 付きで呼ぶ（空の {} は即時失効を保証せず本番で無効化されない不具合があった）', async () => {
    vi.stubEnv('REVALIDATE_SECRET', 'test-secret');
    const req = new NextRequest('https://example.com/api/revalidate', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('sheets', { expire: 0 });
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
});
