import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

import type { TRPCContext } from './context';
import { createCallerFactory, editorProcedure, publicProcedure, router, viewerProcedure } from './init';

/**
 * 認可の入口そのもののテスト。ここが素通りすると、閲覧者向け・編集者向けの
 * すべての procedure が誰でも呼べるようになる（テストが1本も無かった）。
 */
const appRouter = router({
  open: publicProcedure.query(() => 'open'),
  viewerOnly: viewerProcedure.query(({ ctx }) => ctx.isViewer),
  editorOnly: editorProcedure.query(({ ctx }) => ctx.editorUserId),
});

function createCaller(overrides: Partial<TRPCContext>) {
  const ctx = {
    getIsViewer: vi.fn(async () => false),
    getEditorUserId: vi.fn(async () => null),
    ...overrides,
  } as unknown as TRPCContext;
  return createCallerFactory(appRouter)(ctx);
}

describe('viewerProcedure', () => {
  it('閲覧可なら通す', async () => {
    const caller = createCaller({ getIsViewer: async () => true });
    await expect(caller.viewerOnly()).resolves.toBe(true);
  });

  it('閲覧可でなければ UNAUTHORIZED', async () => {
    const caller = createCaller({ getIsViewer: async () => false });
    await expect(caller.viewerOnly()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('editorProcedure', () => {
  it('編集者なら user id を ctx へ載せて通す', async () => {
    const caller = createCaller({ getEditorUserId: async () => 'owner-1' });
    await expect(caller.editorOnly()).resolves.toBe('owner-1');
  });

  it('編集者でなければ UNAUTHORIZED', async () => {
    const caller = createCaller({ getEditorUserId: async () => null });
    await expect(caller.editorOnly()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  // 閲覧 cookie だけで編集 procedure に入れてしまうと、閲覧者が保存できる。
  it('閲覧可でも編集者でなければ通さない', async () => {
    const caller = createCaller({ getIsViewer: async () => true, getEditorUserId: async () => null });
    await expect(caller.editorOnly()).rejects.toBeInstanceOf(TRPCError);
  });
});

describe('publicProcedure', () => {
  it('認証なしで通る', async () => {
    await expect(createCaller({}).open()).resolves.toBe('open');
  });
});
