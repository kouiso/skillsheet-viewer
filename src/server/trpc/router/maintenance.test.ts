import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidateTag }));

import { createCallerFactory } from '../init';
import { createTestContext } from '../test-context';
import { maintenanceRouter } from './maintenance';

const createCaller = createCallerFactory(maintenanceRouter);

function callerWith(request: Request | null) {
  return createCaller(
    createTestContext({
      editorUserId: null,
      isViewer: false,
      request,
      responseHeaders: request ? new Headers() : null,
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('REVALIDATE_SECRET', 'test-secret');
  revalidateTag.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('maintenance.revalidate', () => {
  it('Bearer secret が一致すれば両方のタグを即時失効させる', async () => {
    const caller = callerWith(
      new Request('https://example.com/api/trpc/maintenance.revalidate', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    await expect(caller.revalidate()).resolves.toEqual({
      ok: true,
      revalidated: ['sheets', 'db-sheet'],
    });
    expect(revalidateTag).toHaveBeenNthCalledWith(1, 'sheets', { expire: 0 });
    expect(revalidateTag).toHaveBeenNthCalledWith(2, 'db-sheet', { expire: 0 });
  });

  it('互換用 query secret も受け付ける', async () => {
    const caller = callerWith(new Request('https://example.com/api/trpc/maintenance.revalidate?secret=test-secret'));
    await expect(caller.revalidate()).resolves.toMatchObject({ ok: true });
  });

  it('secret が不一致なら UNAUTHORIZED でタグを失効させない', async () => {
    const caller = callerWith(
      new Request('https://example.com/api/trpc/maintenance.revalidate', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    await expect(caller.revalidate()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('REVALIDATE_SECRET 未設定は INTERNAL_SERVER_ERROR', async () => {
    vi.stubEnv('REVALIDATE_SECRET', '');
    const caller = callerWith(new Request('https://example.com/api/trpc/maintenance.revalidate'));
    await expect(caller.revalidate()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});
