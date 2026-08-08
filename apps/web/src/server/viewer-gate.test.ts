import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookiesGet = vi.fn();
const headersGet = vi.fn();
const verifyMock = vi.fn();
const isEditorMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookiesGet })),
  headers: vi.fn(async () => ({ get: headersGet })),
}));
vi.mock('next/navigation', () => ({ redirect: (p: string) => redirectMock(p) }));
vi.mock('@/server/session', () => ({
  SESSION_COOKIE_NAME: 'session',
  verifySessionToken: (t: unknown) => verifyMock(t),
}));
vi.mock('@/server/auth-gate', () => ({ isEditor: () => isEditorMock() }));

import { hasViewerSession, isViewer, requireViewer } from './viewer-gate';

beforeEach(() => {
  cookiesGet.mockReset();
  headersGet.mockReset();
  headersGet.mockReturnValue(null);
  verifyMock.mockReset();
  isEditorMock.mockReset();
  redirectMock.mockClear();
});

describe('isViewer', () => {
  it('有効な閲覧 cookie があれば true を返す（isEditor は評価しない）', async () => {
    cookiesGet.mockReturnValue({ value: 'tok' });
    verifyMock.mockReturnValue(true);
    await expect(isViewer()).resolves.toBe(true);
    expect(isEditorMock).not.toHaveBeenCalled();
  });

  it('cookie が無効でも isEditor が true なら true を返す', async () => {
    cookiesGet.mockReturnValue(undefined);
    verifyMock.mockReturnValue(false);
    isEditorMock.mockResolvedValue(true);
    await expect(isViewer()).resolves.toBe(true);
  });

  it('cookie 無効かつ非編集者なら false を返す（redirect しない）', async () => {
    cookiesGet.mockReturnValue(undefined);
    verifyMock.mockReturnValue(false);
    isEditorMock.mockResolvedValue(false);
    await expect(isViewer()).resolves.toBe(false);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('hasViewerSession', () => {
  it('HTTP Request headers の cookie から session を検証する', async () => {
    verifyMock.mockReturnValue(true);
    const requestHeaders = new Headers({ cookie: 'other=x; session=http-token; theme=dark' });

    await expect(hasViewerSession(requestHeaders)).resolves.toBe(true);
    expect(verifyMock).toHaveBeenCalledWith('http-token');
    expect(cookiesGet).not.toHaveBeenCalled();
  });
});

describe('requireViewer', () => {
  it('有効な閲覧 cookie があれば通過する（isEditor は評価しない）', async () => {
    cookiesGet.mockReturnValue({ value: 'tok' });
    verifyMock.mockReturnValue(true);
    await expect(requireViewer()).resolves.toBeUndefined();
    expect(isEditorMock).not.toHaveBeenCalled();
  });

  it('cookie が無効でも isEditor が true なら通過する', async () => {
    cookiesGet.mockReturnValue(undefined);
    verifyMock.mockReturnValue(false);
    isEditorMock.mockResolvedValue(true);
    await expect(requireViewer()).resolves.toBeUndefined();
  });

  it('cookie 無効かつ非編集者なら、現在パスを next に付けて /viewer-auth へ redirect する（#155）', async () => {
    cookiesGet.mockReturnValue(undefined);
    verifyMock.mockReturnValue(false);
    isEditorMock.mockResolvedValue(false);
    headersGet.mockReturnValue('/view/db/abc123');
    await expect(requireViewer()).rejects.toThrow('REDIRECT:/viewer-auth?next=%2Fview%2Fdb%2Fabc123');
    expect(redirectMock).toHaveBeenCalledWith('/viewer-auth?next=%2Fview%2Fdb%2Fabc123');
  });

  it('クエリ付きの現在パス（/view/db/abc?tab=skills）も next に保持する', async () => {
    cookiesGet.mockReturnValue(undefined);
    verifyMock.mockReturnValue(false);
    isEditorMock.mockResolvedValue(false);
    headersGet.mockReturnValue('/view/db/abc?tab=skills');
    const expectedNext = encodeURIComponent('/view/db/abc?tab=skills');
    await expect(requireViewer()).rejects.toThrow(`REDIRECT:/viewer-auth?next=${expectedNext}`);
  });

  it('現在パスのヘッダーが無い（ミドルウェア未通過等）場合は next を付けずに redirect する', async () => {
    cookiesGet.mockReturnValue(undefined);
    verifyMock.mockReturnValue(false);
    isEditorMock.mockResolvedValue(false);
    headersGet.mockReturnValue(null);
    await expect(requireViewer()).rejects.toThrow('REDIRECT:/viewer-auth');
    expect(redirectMock).toHaveBeenCalledWith('/viewer-auth');
  });

  it('外部URLがヘッダーに紛れ込んでいても next には載せない（オープンリダイレクト対策）', async () => {
    cookiesGet.mockReturnValue(undefined);
    verifyMock.mockReturnValue(false);
    isEditorMock.mockResolvedValue(false);
    headersGet.mockReturnValue('//evil.example.com');
    await expect(requireViewer()).rejects.toThrow('REDIRECT:/viewer-auth');
    expect(redirectMock).toHaveBeenCalledWith('/viewer-auth');
  });
});
