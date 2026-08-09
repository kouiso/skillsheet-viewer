import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEditorUserIdMock = vi.fn();
const hasViewerSessionMock = vi.fn();

vi.mock('@/server/auth-gate', () => ({
  getEditorUserId: (requestHeaders?: Headers) => getEditorUserIdMock(requestHeaders),
}));
vi.mock('@/server/viewer-gate', () => ({
  hasViewerSession: (requestHeaders?: Headers) => hasViewerSessionMock(requestHeaders),
}));

import { createTRPCContext } from './context';

beforeEach(() => {
  getEditorUserIdMock.mockReset();
  hasViewerSessionMock.mockReset();
});

describe('createTRPCContext', () => {
  // publicProcedure（auth.login/auth.logout/maintenance.revalidate）は認可判定を
  // 必要としないため、context を生成しただけでは Better Auth セッションも閲覧 cookie も
  // 解決してはいけない（DB 障害時に閲覧コード認証まで巻き込まれるのを防ぐための回帰テスト）。
  it('生成しただけでは getEditorUserId / hasViewerSession のどちらも呼ばない', () => {
    createTRPCContext();
    expect(getEditorUserIdMock).not.toHaveBeenCalled();
    expect(hasViewerSessionMock).not.toHaveBeenCalled();
  });

  it('ctx.getEditorUserId() を呼んで初めて解決する', async () => {
    getEditorUserIdMock.mockResolvedValue('owner');
    const ctx = createTRPCContext();
    expect(getEditorUserIdMock).not.toHaveBeenCalled();
    await expect(ctx.getEditorUserId()).resolves.toBe('owner');
    expect(getEditorUserIdMock).toHaveBeenCalledTimes(1);
  });

  it('ctx.getEditorUserId() を複数回呼んでも解決は 1 回だけ（メモ化）', async () => {
    getEditorUserIdMock.mockResolvedValue('owner');
    const ctx = createTRPCContext();
    await Promise.all([ctx.getEditorUserId(), ctx.getEditorUserId(), ctx.getEditorUserId()]);
    expect(getEditorUserIdMock).toHaveBeenCalledTimes(1);
  });

  it('閲覧 cookie が無効でも編集者なら ctx.getIsViewer() は true を返す', async () => {
    getEditorUserIdMock.mockResolvedValue('owner');
    hasViewerSessionMock.mockResolvedValue(false);
    const ctx = createTRPCContext();
    await expect(ctx.getIsViewer()).resolves.toBe(true);
    expect(hasViewerSessionMock).toHaveBeenCalledTimes(1);
  });

  it('編集者でなく閲覧 cookie も無効なら ctx.getIsViewer() は false を返す', async () => {
    getEditorUserIdMock.mockResolvedValue(null);
    hasViewerSessionMock.mockResolvedValue(false);
    const ctx = createTRPCContext();
    await expect(ctx.getIsViewer()).resolves.toBe(false);
  });

  it('閲覧 cookie が有効なら編集者判定を行わず ctx.getIsViewer() は true を返す', async () => {
    hasViewerSessionMock.mockResolvedValue(true);
    const ctx = createTRPCContext();
    await expect(ctx.getIsViewer()).resolves.toBe(true);
    expect(getEditorUserIdMock).not.toHaveBeenCalled();
  });

  it('ctx.getIsViewer() を複数回呼んでも有効な閲覧 cookie の解決は 1 回だけ', async () => {
    hasViewerSessionMock.mockResolvedValue(true);
    const ctx = createTRPCContext();
    await Promise.all([ctx.getIsViewer(), ctx.getIsViewer()]);
    expect(getEditorUserIdMock).not.toHaveBeenCalled();
    expect(hasViewerSessionMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 経路では同じ Request headers を認証判定と context に渡す', async () => {
    getEditorUserIdMock.mockResolvedValue(null);
    hasViewerSessionMock.mockResolvedValue(true);
    const req = new Request('https://example.com/api/trpc/auth.status', {
      headers: { cookie: 'session=token' },
    });
    const resHeaders = new Headers();
    const ctx = createTRPCContext({ req, resHeaders });

    expect(ctx.request).toBe(req);
    expect(ctx.responseHeaders).toBe(resHeaders);
    await expect(ctx.getIsViewer()).resolves.toBe(true);
    expect(getEditorUserIdMock).not.toHaveBeenCalled();
    expect(hasViewerSessionMock).toHaveBeenCalledWith(req.headers);
  });
});
