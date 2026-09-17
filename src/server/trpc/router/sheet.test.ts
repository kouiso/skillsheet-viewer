import { beforeEach, describe, expect, it, vi } from 'vitest';

// appRouter は github-sheet.ts 経由で sheets-cache.ts（unstable_cache 使用）も読み込むため、
// revalidateTag のみ上書きし他の export は importOriginal で残す。
vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return { ...actual, revalidateTag: vi.fn() };
});

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return {
    ...actual,
    getDb: vi.fn(),
    getOwnerId: () => 'owner',
    saveSkillSheetBlocks: vi.fn(),
    createSheet: vi.fn(),
    deleteSheet: vi.fn(),
    listSheets: vi.fn(),
  };
});

// list/byId/getDefault は unstable_cache 経由で実 DB を呼んでしまうため、
// sheets-cache.ts の export ごとモックする（github-sheet.test.ts と同じ方針）。
// toStaleSheet は fetchedAt 非依存の純粋関数なので importOriginal の実装をそのまま使う。
vi.mock('@/server/sheets-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/sheets-cache')>();
  return {
    ...actual,
    getCachedSheet: vi.fn(),
    getCachedSheets: vi.fn(),
    getCachedDbSheets: vi.fn(),
    getCachedDbSheetById: vi.fn(),
    getCachedDbSheet: vi.fn(),
  };
});

vi.mock('@/db/document-service', async (original) => ({
  ...(await original<typeof import('@/db/document-service')>()),
  createDocumentService: vi.fn(),
}));

import { revalidateTag } from 'next/cache';
import { SkillSheetNotFoundError } from '@/db';
import { createDocumentService, DocumentError } from '@/db/document-service';

import { getCachedDbSheet, getCachedDbSheetById } from '@/server/sheets-cache';

import { createCallerFactory } from '../init';
import { createTestContext } from '../test-context';
import { appRouter } from './index';

const createCaller = createCallerFactory(appRouter);
const getCachedDbSheetByIdMock = vi.mocked(getCachedDbSheetById);
const getCachedDbSheetMock = vi.mocked(getCachedDbSheet);
const revalidateTagMock = vi.mocked(revalidateTag);
const MD = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', order: 0, type: 'markdown' as const, data: { markdown: 'x' } };
const SHEET_ID = '00000000-0000-4000-8000-000000000001';

// editorProcedure/viewerProcedure は middleware が ctx.getEditorUserId() / ctx.getIsViewer() を
// 解決するだけなので、createTRPCContext()（cookies/headers 読み取り）を経由せず
// createTestContext() で既知の値をコンテキストへ直接組み立てられる。
// auth-gate/viewer-gate のモックが不要になる。
function callerAs(editorUserId: string | null, isViewer = editorUserId !== null) {
  return createCaller(createTestContext({ editorUserId, isViewer, request: null, responseHeaders: null }));
}

const service = { read: vi.fn(), list: vi.fn(), replace: vi.fn(), create: vi.fn(), delete: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createDocumentService).mockReturnValue(service as never);
  service.list.mockResolvedValue([]);
});

describe('sheet.byId', () => {
  // sheetIdInputSchema が z.uuid() を要求する（Issue #196）ため、ここから先は
  // 実在有無に関わらず UUID の形式を満たす値を使う。
  const VALID_ID = '11111111-1111-4111-8111-111111111111';

  it('viewer でない場合は UNAUTHORIZED を返す', async () => {
    const caller = callerAs(null, false);
    await expect(caller.sheet.byId({ id: VALID_ID })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getCachedDbSheetByIdMock).not.toHaveBeenCalled();
  });

  it('SkillSheetNotFoundError は NOT_FOUND に変換する', async () => {
    getCachedDbSheetByIdMock.mockRejectedValue(new SkillSheetNotFoundError(VALID_ID));
    const caller = callerAs(null, true);
    await expect(caller.sheet.byId({ id: VALID_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('未知のエラーはそのまま伝播する', async () => {
    getCachedDbSheetByIdMock.mockRejectedValue(new Error('db down'));
    const caller = callerAs(null, true);
    await expect(caller.sheet.byId({ id: VALID_ID })).rejects.not.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('viewer は指定 id のシートを返す（fetchedAt は落とし stale に置き換える）', async () => {
    const sheet = { id: VALID_ID, title: 'T1', blocks: [MD], fetchedAt: Date.now() };
    getCachedDbSheetByIdMock.mockResolvedValue(sheet as never);
    const caller = callerAs(null, true);
    const result = await caller.sheet.byId({ id: VALID_ID });
    expect(result).toEqual({ id: VALID_ID, title: 'T1', blocks: [MD], stale: false });
    expect(result).not.toHaveProperty('fetchedAt');
    expect(getCachedDbSheetByIdMock).toHaveBeenCalledWith(VALID_ID);
  });

  it('再検証間隔の3倍を超えて古い fetchedAt は stale: true になる', async () => {
    const staleFetchedAt = Date.now() - 61 * 60 * 1000; // 十分に古い（60秒revalidateの3倍=180秒を大幅に超える）
    const sheet = { id: VALID_ID, title: 'T1', blocks: [MD], fetchedAt: staleFetchedAt };
    getCachedDbSheetByIdMock.mockResolvedValue(sheet as never);
    const caller = callerAs(null, true);
    const result = await caller.sheet.byId({ id: VALID_ID });
    expect(result).toMatchObject({ stale: true });
  });

  it('UUID の形式でない id は BAD_REQUEST を返し、DB へは問い合わせない（Issue #196）', async () => {
    const caller = callerAs(null, true);
    await expect(caller.sheet.byId({ id: 'not-a-uuid' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(getCachedDbSheetByIdMock).not.toHaveBeenCalled();
  });
});

describe('sheet.getDefault', () => {
  it('viewer でない場合は UNAUTHORIZED を返す', async () => {
    const caller = callerAs(null, false);
    await expect(caller.sheet.getDefault()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getCachedDbSheetMock).not.toHaveBeenCalled();
  });

  it('viewer は getCachedDbSheet の結果を返す（fetchedAt は落とし stale に置き換える）', async () => {
    const sheet = { id: 's1', title: 'デフォルト', blocks: [MD], fetchedAt: Date.now() };
    getCachedDbSheetMock.mockResolvedValue(sheet as never);
    const caller = callerAs(null, true);
    const result = await caller.sheet.getDefault();
    expect(result).toEqual({ id: 's1', title: 'デフォルト', blocks: [MD], stale: false });
    expect(result).not.toHaveProperty('fetchedAt');
  });
});

const snapshot = {
  sheetId: SHEET_ID,
  title: 'T',
  revision: '0',
  blocks: [MD],
  validation: { editable: true, issues: [] },
};
const saveInput = { sheetId: SHEET_ID, title: 'T', blocks: [MD], expectedRevision: '0' };
describe('owner-bound document API', () => {
  it('requires viewer authentication for navigation', async () => {
    await expect(callerAs(null, false).sheet.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(service.list).not.toHaveBeenCalled();
  });
  it('reads navigation without loading or initializing a document', async () => {
    expect(await callerAs('owner').sheet.list()).toEqual({ sheets: [], stale: false });
    expect(service.read).not.toHaveBeenCalled();
  });
  it('uses snapshot identity even when navigation is empty', async () => {
    service.read.mockResolvedValue({ status: 'OK', snapshot });
    expect(await callerAs('owner').sheet.builderState({ sheetId: SHEET_ID })).toEqual({
      status: 'OK',
      snapshot,
      sheets: [],
    });
    expect(service.read).toHaveBeenCalledWith(SHEET_ID);
  });
  it('never substitutes a default document for a missing explicit ID', async () => {
    service.read.mockResolvedValue({ status: 'NOT_FOUND' });
    await expect(callerAs('owner').sheet.builderState({ sheetId: SHEET_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(service.read).toHaveBeenCalledTimes(1);
  });
  it.each(['EMPTY', 'INVALID_STATE'])('returns %s without implicit create', async (status) => {
    service.read.mockResolvedValue({ status });
    expect(await callerAs('owner').sheet.builderState({})).toEqual({ status, sheets: [] });
    expect(service.create).not.toHaveBeenCalled();
  });
  it('requires editor auth for every writer', async () => {
    const caller = callerAs(null, true);
    await expect(caller.sheet.save(saveInput)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.sheet.create({ sheetId: SHEET_ID, title: 'T', blocks: [MD] })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(caller.sheet.delete({ sheetId: SHEET_ID, expectedRevision: '0' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(service.replace).not.toHaveBeenCalled();
  });
  it('rejects missing IDs, missing revision and number revision before save', async () => {
    for (const input of [
      { title: 'T', blocks: [MD] },
      { ...saveInput, expectedRevision: 0 },
      { ...saveInput, sheetId: 'bad' },
    ]) {
      await expect(callerAs('owner').sheet.save(input as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(service.replace).not.toHaveBeenCalled();
  });
  it('passes exact snapshot revision zero and block IDs to save', async () => {
    service.replace.mockResolvedValue(snapshot);
    expect(await callerAs('owner').sheet.save(saveInput)).toEqual(snapshot);
    expect(service.replace).toHaveBeenCalledWith(SHEET_ID, '0', 'T', [MD]);
    expect(revalidateTag).toHaveBeenCalledWith('db-sheet', { expire: 0 });
  });
  it.each([
    ['CONFLICT', 'CONFLICT'],
    ['UNEDITABLE_DOCUMENT', 'PRECONDITION_FAILED'],
    ['NOT_FOUND', 'NOT_FOUND'],
  ])('maps %s without hiding failures', async (code, expected) => {
    service.replace.mockRejectedValueOnce(new DocumentError(code));
    await expect(callerAs('owner').sheet.save(saveInput)).rejects.toMatchObject({ code: expected });
  });
  it('does not report a committed write as failed when cache invalidation fails', async () => {
    service.replace.mockResolvedValue(snapshot);
    revalidateTagMock.mockImplementationOnce(() => {
      throw new Error('cache unavailable');
    });
    await expect(callerAs('owner').sheet.save(saveInput)).resolves.toEqual(snapshot);
  });
  it('preserves the caller create operation UUID and content', async () => {
    service.create.mockResolvedValue(snapshot);
    await callerAs('owner').sheet.create({ sheetId: SHEET_ID, title: 'T', blocks: [MD] });
    expect(service.create).toHaveBeenCalledWith(SHEET_ID, 'T', [MD]);
  });
  it('requires deletion revision and supports deleting the last document', async () => {
    service.delete.mockResolvedValue(undefined);
    await expect(callerAs('owner').sheet.delete({ sheetId: SHEET_ID } as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(callerAs('owner').sheet.delete({ sheetId: SHEET_ID, expectedRevision: '0' })).resolves.toEqual({
      ok: true,
    });
    expect(service.delete).toHaveBeenCalledWith(SHEET_ID, '0');
  });
});
