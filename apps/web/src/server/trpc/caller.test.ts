import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTRPCContextMock = vi.fn();
const SHEET_ID = '00000000-0000-4000-8000-000000000001';

vi.mock('./context', () => ({ createTRPCContext: () => createTRPCContextMock() }));

vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return { ...actual, revalidateTag: vi.fn() };
});

vi.mock('@skillsheet/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@skillsheet/db')>();
  return { ...actual, deleteSheet: vi.fn().mockResolvedValue(undefined) };
});

import { createServerCaller } from './caller';
import { createTestContext } from './test-context';

beforeEach(() => {
  createTRPCContextMock.mockReset();
});

// React cache() は実際のレンダーコンテキスト外（このテスト環境）ではメモ化せず、
// 呼び出すたびに関数を再実行する（実測で確認済み）。ここでは「メモ化されること」ではなく、
// createServerCaller が createTRPCContext の結果を正しく caller に渡すことだけを検証する
// （メモ化そのものは Next.js の RSC レンダー内でのみ成立する挙動で、単体テストの対象外）。
describe('createServerCaller', () => {
  it('createTRPCContext の結果を使って appRouter の caller を組み立てる', async () => {
    createTRPCContextMock.mockResolvedValue(
      createTestContext({ editorUserId: null, isViewer: true, request: null, responseHeaders: null }),
    );
    const caller = await createServerCaller();
    expect(typeof caller.sheet.list).toBe('function');
    expect(typeof caller.githubSheet.byPath).toBe('function');
    expect(createTRPCContextMock).toHaveBeenCalled();
  });

  it('editorUserId を持つ context なら editorProcedure を通過できる', async () => {
    createTRPCContextMock.mockResolvedValue(
      createTestContext({ editorUserId: 'owner', isViewer: true, request: null, responseHeaders: null }),
    );
    const caller = await createServerCaller();
    await expect(caller.sheet.delete({ sheetId: SHEET_ID })).resolves.toEqual({ ok: true });
  });

  it('editorUserId が無い context では editorProcedure が UNAUTHORIZED になる', async () => {
    createTRPCContextMock.mockResolvedValue(
      createTestContext({ editorUserId: null, isViewer: true, request: null, responseHeaders: null }),
    );
    const caller = await createServerCaller();
    await expect(caller.sheet.delete({ sheetId: SHEET_ID })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
