import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookiesGet = vi.fn();
const verifyMock = vi.fn();
const isEditorMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: cookiesGet })) }));
vi.mock('next/navigation', () => ({ redirect: (p: string) => redirectMock(p) }));
vi.mock('@/server/session', () => ({
  SESSION_COOKIE_NAME: 'session',
  verifySessionToken: (t: unknown) => verifyMock(t),
}));
vi.mock('@/server/auth-gate', () => ({ isEditor: () => isEditorMock() }));

import { requireViewer } from './viewer-gate';

beforeEach(() => {
  cookiesGet.mockReset();
  verifyMock.mockReset();
  isEditorMock.mockReset();
  redirectMock.mockClear();
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

  it('cookie 無効かつ非編集者なら /viewer-auth へ redirect する', async () => {
    cookiesGet.mockReturnValue(undefined);
    verifyMock.mockReturnValue(false);
    isEditorMock.mockResolvedValue(false);
    await expect(requireViewer()).rejects.toThrow('REDIRECT:/viewer-auth');
    expect(redirectMock).toHaveBeenCalledWith('/viewer-auth');
  });
});
