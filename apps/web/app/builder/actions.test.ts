import { beforeEach, describe, expect, it, vi } from 'vitest';

const isEditorMock = vi.fn();
vi.mock('@/server/auth-gate', () => ({ isEditor: () => isEditorMock() }));
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));

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

import { ConflictError, saveSkillSheetBlocks } from '@skillsheet/db';
import { saveBlocksAction } from './actions';

const saveMock = vi.mocked(saveSkillSheetBlocks);
const MD = { type: 'markdown' as const, data: { markdown: 'x' } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveBlocksAction', () => {
  it('非編集者は unauthorized を返し保存しない', async () => {
    isEditorMock.mockResolvedValue(false);
    const r = await saveBlocksAction({ title: 'T', blocks: [MD] });
    expect(r).toEqual({ ok: false, error: 'unauthorized' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('不正な payload は invalid payload を返す', async () => {
    isEditorMock.mockResolvedValue(true);
    const bad = await saveBlocksAction({ title: 'T', blocks: [{ type: 'bogus', data: {} }] } as never);
    expect(bad).toEqual({ ok: false, error: 'invalid payload' });
    const notArray = await saveBlocksAction({ title: 'T', blocks: 'x' } as never);
    expect(notArray).toEqual({ ok: false, error: 'invalid payload' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('ConflictError は conflict に変換する', async () => {
    isEditorMock.mockResolvedValue(true);
    saveMock.mockRejectedValue(new ConflictError());
    const r = await saveBlocksAction({ title: 'T', blocks: [MD] });
    expect(r).toEqual({ ok: false, error: 'conflict' });
  });

  it('成功時は ok と savedUpdatedAt を返す', async () => {
    isEditorMock.mockResolvedValue(true);
    const d = new Date('2026-05-01T00:00:00.000Z');
    saveMock.mockResolvedValue({ updatedAt: d });
    const r = await saveBlocksAction({ title: 'T', blocks: [MD] });
    expect(r).toEqual({ ok: true, savedUpdatedAt: d });
  });
});
