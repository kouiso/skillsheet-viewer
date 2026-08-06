import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTRPCContextMock = vi.fn();

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

beforeEach(() => {
  createTRPCContextMock.mockReset();
});

// React cache() は実際のレンダーコンテキスト外（このテスト環境）ではメモ化せず、
// 呼び出すたびに関数を再実行する（実測で確認済み）。ここでは「メモ化されること」ではなく、
// createServerCaller が createTRPCContext の結果を正しく caller に渡すことだけを検証する
// （メモ化そのものは Next.js の RSC レンダー内でのみ成立する挙動で、単体テストの対象外）。
describe('createServerCaller', () => {
  it('createTRPCContext の結果を使って appRouter の caller を組み立てる', async () => {
    createTRPCContextMock.mockResolvedValue({ editorUserId: null, isViewer: true });
    const caller = await createServerCaller();
    expect(typeof caller.sheet.list).toBe('function');
    expect(typeof caller.githubSheet.byPath).toBe('function');
    expect(createTRPCContextMock).toHaveBeenCalled();
  });

  it('editorUserId を持つ context なら editorProcedure を通過できる', async () => {
    createTRPCContextMock.mockResolvedValue({ editorUserId: 'owner', isViewer: true });
    const caller = await createServerCaller();
    await expect(caller.sheet.delete({ sheetId: 's1' })).resolves.toEqual({ ok: true });
  });

  it('editorUserId が無い context では editorProcedure が UNAUTHORIZED になる', async () => {
    createTRPCContextMock.mockResolvedValue({ editorUserId: null, isViewer: true });
    const caller = await createServerCaller();
    await expect(caller.sheet.delete({ sheetId: 's1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
