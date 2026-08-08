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
    createSheet: vi.fn(),
    deleteSheet: vi.fn(),
    listSheets: vi.fn(),
  };
});

// list/byId/getDefault は unstable_cache 経由で実 DB を呼んでしまうため、
// sheets-cache.ts の export ごとモックする（github-sheet.test.ts と同じ方針）。
vi.mock('@/server/sheets-cache', () => ({
  getCachedSheet: vi.fn(),
  getCachedSheets: vi.fn(),
  getCachedDbSheets: vi.fn(),
  getCachedDbSheetById: vi.fn(),
  getCachedDbSheet: vi.fn(),
}));

import {
  ConflictError,
  createSheet,
  deleteSheet,
  listSheets,
  SkillSheetNotFoundError,
  saveSkillSheetBlocks,
} from '@skillsheet/db';
import { revalidateTag } from 'next/cache';

import { getCachedDbSheet, getCachedDbSheetById, getCachedDbSheets } from '@/server/sheets-cache';

import { createCallerFactory } from '../init';
import { createTestContext } from '../test-context';
import { appRouter } from './index';

const createCaller = createCallerFactory(appRouter);
const saveMock = vi.mocked(saveSkillSheetBlocks);
const createSheetMock = vi.mocked(createSheet);
const deleteSheetMock = vi.mocked(deleteSheet);
const listSheetsMock = vi.mocked(listSheets);
const getCachedDbSheetsMock = vi.mocked(getCachedDbSheets);
const getCachedDbSheetByIdMock = vi.mocked(getCachedDbSheetById);
const getCachedDbSheetMock = vi.mocked(getCachedDbSheet);
const revalidateTagMock = vi.mocked(revalidateTag);
const MD = { type: 'markdown' as const, data: { markdown: 'x' } };

// editorProcedure/viewerProcedure は middleware が ctx.getEditorUserId() / ctx.getIsViewer() を
// 解決するだけなので、createTRPCContext()（cookies/headers 読み取り）を経由せず
// createTestContext() で既知の値をコンテキストへ直接組み立てられる。
// auth-gate/viewer-gate のモックが不要になる。
function callerAs(editorUserId: string | null, isViewer = editorUserId !== null) {
  return createCaller(createTestContext({ editorUserId, isViewer, request: null, responseHeaders: null }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sheet.list', () => {
  it('viewer でない場合は UNAUTHORIZED を返す', async () => {
    const caller = callerAs(null, false);
    await expect(caller.sheet.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getCachedDbSheetsMock).not.toHaveBeenCalled();
  });

  it('viewer は getCachedDbSheets の結果をそのまま返す', async () => {
    const summaries = [{ id: 's1', title: 'T1', updatedAt: new Date('2026-01-01T00:00:00.000Z') }];
    getCachedDbSheetsMock.mockResolvedValue(summaries as never);
    const caller = callerAs(null, true);
    const result = await caller.sheet.list();
    expect(result).toEqual(summaries);
  });
});

describe('sheet.builderState', () => {
  it('非編集者は UNAUTHORIZED を返す', async () => {
    const caller = callerAs(null, true);
    await expect(caller.sheet.builderState({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getCachedDbSheetsMock).not.toHaveBeenCalled();
  });

  it('指定 sheetId が一覧にあればそのシートを返す', async () => {
    const sheets = [{ id: 's2', title: 'T2', updatedAt: new Date('2026-01-01T00:00:00.000Z') }];
    const sheet = { title: 'T2', blocks: [MD] };
    getCachedDbSheetsMock.mockResolvedValue(sheets as never);
    getCachedDbSheetByIdMock.mockResolvedValue(sheet as never);

    const result = await callerAs('owner').sheet.builderState({ sheetId: 's2' });
    expect(result).toEqual({ sheet, sheets, activeSheetId: 's2' });
    expect(getCachedDbSheetByIdMock).toHaveBeenCalledWith('s2');
    expect(getCachedDbSheetMock).not.toHaveBeenCalled();
  });

  it('sheetId 未指定なら一覧の先頭を active にしてデフォルトシートを返す', async () => {
    const sheets = [{ id: 's1', title: 'T1', updatedAt: new Date('2026-01-01T00:00:00.000Z') }];
    const sheet = { title: 'T1', blocks: [MD] };
    getCachedDbSheetsMock.mockResolvedValue(sheets as never);
    getCachedDbSheetMock.mockResolvedValue(sheet as never);

    await expect(callerAs('owner').sheet.builderState({})).resolves.toEqual({
      sheet,
      sheets,
      activeSheetId: 's1',
    });
  });

  it('空一覧がキャッシュ済みでも seed 後の正本を一度だけ再取得する', async () => {
    const sheet = { title: 'Seeded', blocks: [MD] };
    const seededSheets = [{ id: 'seeded', title: 'Seeded', updatedAt: new Date('2026-01-01T00:00:00.000Z') }];
    getCachedDbSheetsMock.mockResolvedValue([]);
    getCachedDbSheetMock.mockResolvedValue(sheet as never);
    listSheetsMock.mockResolvedValue(seededSheets as never);

    await expect(callerAs('owner').sheet.builderState({})).resolves.toEqual({
      sheet,
      sheets: seededSheets,
      activeSheetId: 'seeded',
    });
    expect(listSheetsMock).toHaveBeenCalledOnce();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

describe('sheet.byId', () => {
  it('viewer でない場合は UNAUTHORIZED を返す', async () => {
    const caller = callerAs(null, false);
    await expect(caller.sheet.byId({ id: 's1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getCachedDbSheetByIdMock).not.toHaveBeenCalled();
  });

  it('SkillSheetNotFoundError は NOT_FOUND に変換する', async () => {
    getCachedDbSheetByIdMock.mockRejectedValue(new SkillSheetNotFoundError('missing'));
    const caller = callerAs(null, true);
    await expect(caller.sheet.byId({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('未知のエラーはそのまま伝播する', async () => {
    getCachedDbSheetByIdMock.mockRejectedValue(new Error('db down'));
    const caller = callerAs(null, true);
    await expect(caller.sheet.byId({ id: 's1' })).rejects.not.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('viewer は指定 id のシートを返す', async () => {
    const sheet = { id: 's1', title: 'T1', blocks: [MD] };
    getCachedDbSheetByIdMock.mockResolvedValue(sheet as never);
    const caller = callerAs(null, true);
    const result = await caller.sheet.byId({ id: 's1' });
    expect(result).toEqual(sheet);
    expect(getCachedDbSheetByIdMock).toHaveBeenCalledWith('s1');
  });
});

describe('sheet.getDefault', () => {
  it('viewer でない場合は UNAUTHORIZED を返す', async () => {
    const caller = callerAs(null, false);
    await expect(caller.sheet.getDefault()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getCachedDbSheetMock).not.toHaveBeenCalled();
  });

  it('viewer は getCachedDbSheet の結果を返す', async () => {
    const sheet = { id: 's1', title: 'デフォルト', blocks: [MD] };
    getCachedDbSheetMock.mockResolvedValue(sheet as never);
    const caller = callerAs(null, true);
    const result = await caller.sheet.getDefault();
    expect(result).toEqual(sheet);
  });
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

  it('ConflictError は CONFLICT に変換し、キャッシュは無効化しない', async () => {
    saveMock.mockRejectedValue(new ConflictError());
    const caller = callerAs('owner');
    await expect(caller.sheet.save({ title: 'T', blocks: [MD] })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('成功時は updatedAt を返し db-sheet タグを即時失効させる', async () => {
    const d = new Date('2026-05-01T00:00:00.000Z');
    saveMock.mockResolvedValue({ updatedAt: d });
    const caller = callerAs('owner');
    const result = await caller.sheet.save({ title: 'T', blocks: [MD] });
    expect(result).toEqual({ updatedAt: d });
    expect(revalidateTagMock).toHaveBeenCalledWith('db-sheet', { expire: 0 });
  });
});

describe('sheet.create', () => {
  it('非編集者は UNAUTHORIZED を返し作成しない', async () => {
    const caller = callerAs(null);
    await expect(caller.sheet.create({ title: 'New' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(createSheetMock).not.toHaveBeenCalled();
  });

  it('templateId 未指定なら initialBlocks は undefined で作成し、キャッシュを即時失効させる', async () => {
    createSheetMock.mockResolvedValue('new-id');
    const caller = callerAs('owner');
    const result = await caller.sheet.create({ title: 'New' });
    expect(result).toEqual({ sheetId: 'new-id' });
    expect(createSheetMock).toHaveBeenCalledWith('New', undefined);
    expect(revalidateTagMock).toHaveBeenCalledWith('db-sheet', { expire: 0 });
  });

  it('templateId 指定時はテンプレートの blocks を渡して作成する', async () => {
    createSheetMock.mockResolvedValue('new-id-2');
    const caller = callerAs('owner');
    const result = await caller.sheet.create({ title: 'New', templateId: 'blank' });
    expect(result).toEqual({ sheetId: 'new-id-2' });
    expect(createSheetMock).toHaveBeenCalledWith('New', expect.any(Array));
  });

  it('存在しない templateId は initialBlocks を undefined として扱う', async () => {
    createSheetMock.mockResolvedValue('new-id-3');
    const caller = callerAs('owner');
    await caller.sheet.create({ title: 'New', templateId: 'no-such-template' });
    expect(createSheetMock).toHaveBeenCalledWith('New', undefined);
  });
});

describe('sheet.delete', () => {
  it('非編集者は UNAUTHORIZED を返し削除しない', async () => {
    const caller = callerAs(null);
    await expect(caller.sheet.delete({ sheetId: 's1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(deleteSheetMock).not.toHaveBeenCalled();
  });

  it('編集者は指定 sheetId を削除し、キャッシュを即時失効させる', async () => {
    const caller = callerAs('owner');
    const result = await caller.sheet.delete({ sheetId: 's1' });
    expect(result).toEqual({ ok: true });
    expect(deleteSheetMock).toHaveBeenCalledWith('s1');
    expect(revalidateTagMock).toHaveBeenCalledWith('db-sheet', { expire: 0 });
  });
});
