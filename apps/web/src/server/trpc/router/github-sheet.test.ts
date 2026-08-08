import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return { ...actual, revalidateTag: vi.fn() };
});

vi.mock('@/server/sheets-cache', () => ({
  getCachedSheet: vi.fn(),
  getCachedSheets: vi.fn(),
  getCachedDbSheets: vi.fn(),
  getCachedDbSheetById: vi.fn(),
  getCachedDbSheet: vi.fn(),
}));

import { getCachedSheet, getCachedSheets } from '@/server/sheets-cache';

import { createCallerFactory } from '../init';
import { createTestContext } from '../test-context';
import { appRouter } from './index';

const createCaller = createCallerFactory(appRouter);
const getCachedSheetMock = vi.mocked(getCachedSheet);
const getCachedSheetsMock = vi.mocked(getCachedSheets);

function callerAsViewer() {
  return createCaller(createTestContext({ editorUserId: null, isViewer: true, request: null, responseHeaders: null }));
}

function callerAsNonViewer() {
  return createCaller(createTestContext({ editorUserId: null, isViewer: false, request: null, responseHeaders: null }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('githubSheet.list', () => {
  it('viewer でない場合は UNAUTHORIZED を返す', async () => {
    const caller = callerAsNonViewer();
    await expect(caller.githubSheet.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getCachedSheetsMock).not.toHaveBeenCalled();
  });

  it('viewer は getCachedSheets の結果をそのまま返す', async () => {
    const sheets = [{ path: 'a.md', title: 'A' }];
    getCachedSheetsMock.mockResolvedValue(sheets as never);
    const caller = callerAsViewer();
    const result = await caller.githubSheet.list();
    expect(result).toEqual(sheets);
  });
});

describe('githubSheet.byPath', () => {
  it('viewer でない場合は path の妥当性に関わらず UNAUTHORIZED を返す', async () => {
    const caller = callerAsNonViewer();
    await expect(caller.githubSheet.byPath({ path: '技術スキルシート.md' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(getCachedSheetMock).not.toHaveBeenCalled();
  });

  it('存在しないファイルは SheetNotFoundError を NOT_FOUND に変換する', async () => {
    const { SheetNotFoundError } = await import('@/server/github-sheets');
    getCachedSheetMock.mockRejectedValue(new SheetNotFoundError('not-found.md'));
    const caller = callerAsViewer();
    await expect(caller.githubSheet.byPath({ path: 'not-found.md' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  // /view/[path] は isValidSheetPath / isSheetFileName で notFound() にしていたが、
  // これは元々ページ側だけの防御だった。/api/trpc は URL を直叩きできるため、router 側でも
  // 同じ検証を通さないと .. トラバーサルや CLAUDE.md 等の AI 指示系ファイルが
  // GitHub API へそのまま渡ってしまう（Codex レビュー指摘）。

  it('ディレクトリトラバーサルを含む path は NOT_FOUND にし GitHub API を呼ばない', async () => {
    const caller = callerAsViewer();
    await expect(caller.githubSheet.byPath({ path: '../../etc/passwd.md' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(getCachedSheetMock).not.toHaveBeenCalled();
  });

  it('AI 指示系ファイル（CLAUDE.md 等）は NOT_FOUND にし GitHub API を呼ばない', async () => {
    const caller = callerAsViewer();
    await expect(caller.githubSheet.byPath({ path: 'CLAUDE.md' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(getCachedSheetMock).not.toHaveBeenCalled();
  });

  it('.md 以外の拡張子は NOT_FOUND にし GitHub API を呼ばない', async () => {
    const caller = callerAsViewer();
    await expect(caller.githubSheet.byPath({ path: 'skill.txt' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(getCachedSheetMock).not.toHaveBeenCalled();
  });

  it('正当な path は getCachedSheet に渡り結果を返す', async () => {
    const content = { title: 'x', body: 'y' };
    getCachedSheetMock.mockResolvedValue(content as never);
    const caller = callerAsViewer();
    const result = await caller.githubSheet.byPath({ path: '技術スキルシート.md' });
    expect(result).toEqual(content);
    expect(getCachedSheetMock).toHaveBeenCalledWith('技術スキルシート.md');
  });
});
