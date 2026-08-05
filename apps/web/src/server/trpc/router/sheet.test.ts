import { beforeEach, describe, expect, it, vi } from 'vitest';

// appRouter は github-sheet.ts 経由で sheets-cache.ts（unstable_cache 使用）も読み込むため、
// revalidateTag のみ上書きし他の export は importOriginal で残す。
vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return { ...actual, revalidateTag: vi.fn() };
});

vi.mock('@skillsheet/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@skillsheet/db')>();
  return {
    ...actual,
    saveSkillSheetBlocks: vi.fn(),
  };
});

import { ConflictError, saveSkillSheetBlocks } from '@skillsheet/db';

import { createCallerFactory } from '../init';
import { appRouter } from './index';

const createCaller = createCallerFactory(appRouter);
const saveMock = vi.mocked(saveSkillSheetBlocks);
const MD = { type: 'markdown' as const, data: { markdown: 'x' } };

// editorProcedure は ctx.editorUserId のみで判定するため、createTRPCContext()（cookies/headers 読み取り）
// を経由せずコンテキストを直接組み立てられる。auth-gate/viewer-gate のモックが不要になる。
function callerAs(editorUserId: string | null) {
  return createCaller({ editorUserId, isViewer: editorUserId !== null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sheet.save', () => {
  it('非編集者は UNAUTHORIZED を返し保存しない', async () => {
    const caller = callerAs(null);
    await expect(caller.sheet.save({ title: 'T', blocks: [MD] })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('不正な blocks は BAD_REQUEST を返す', async () => {
    const caller = callerAs('owner');
    await expect(
      caller.sheet.save({ title: 'T', blocks: [{ type: 'bogus', data: {} }] as never }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('ConflictError は CONFLICT に変換する', async () => {
    saveMock.mockRejectedValue(new ConflictError());
    const caller = callerAs('owner');
    await expect(caller.sheet.save({ title: 'T', blocks: [MD] })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('成功時は updatedAt を返す', async () => {
    const d = new Date('2026-05-01T00:00:00.000Z');
    saveMock.mockResolvedValue({ updatedAt: d });
    const caller = callerAs('owner');
    const result = await caller.sheet.save({ title: 'T', blocks: [MD] });
    expect(result).toEqual({ updatedAt: d });
  });
});
