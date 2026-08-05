import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEditorUserIdMock = vi.fn();
const isViewerMock = vi.fn();

vi.mock('@/server/auth-gate', () => ({ getEditorUserId: () => getEditorUserIdMock() }));
vi.mock('@/server/viewer-gate', () => ({ isViewer: () => isViewerMock() }));

import { createTRPCContext } from './context';

beforeEach(() => {
  getEditorUserIdMock.mockReset();
  isViewerMock.mockReset();
});

describe('createTRPCContext', () => {
  it('編集者なら isViewer() を呼ばずに isViewer: true を返す（二重セッション参照の回避）', async () => {
    getEditorUserIdMock.mockResolvedValue('owner');
    const ctx = await createTRPCContext();
    expect(ctx).toEqual({ editorUserId: 'owner', isViewer: true });
    expect(isViewerMock).not.toHaveBeenCalled();
  });

  it('編集者でなく閲覧 cookie も無効なら isViewer: false を返す', async () => {
    getEditorUserIdMock.mockResolvedValue(null);
    isViewerMock.mockResolvedValue(false);
    const ctx = await createTRPCContext();
    expect(ctx).toEqual({ editorUserId: null, isViewer: false });
    expect(isViewerMock).toHaveBeenCalled();
  });

  it('編集者でなくても閲覧 cookie が有効なら isViewer: true を返す', async () => {
    getEditorUserIdMock.mockResolvedValue(null);
    isViewerMock.mockResolvedValue(true);
    const ctx = await createTRPCContext();
    expect(ctx).toEqual({ editorUserId: null, isViewer: true });
  });
});
