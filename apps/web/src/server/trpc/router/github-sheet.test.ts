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

import { getCachedSheet } from '@/server/sheets-cache';

import { createCallerFactory } from '../init';
import { appRouter } from './index';

const createCaller = createCallerFactory(appRouter);
const getCachedSheetMock = vi.mocked(getCachedSheet);

function callerAsViewer() {
  return createCaller({ editorUserId: null, isViewer: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('githubSheet.byPath', () => {
  // /view/[path] と /compare は isValidSheetPath / isSheetFileName で notFound() にしていたが、
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
