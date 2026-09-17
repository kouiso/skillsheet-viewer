import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client';
import { readTargetBlocks, resolveTargetSheetIds } from './block-write';

const id = '00000000-0000-4000-8000-000000000001';
afterEach(() => vi.unstubAllEnvs());
function database(result: unknown) {
  const execute = vi.fn().mockResolvedValue({ rows: [{ result }] });
  const select = vi.fn();
  return { execute, select, db: { execute, select } as unknown as Database };
}

describe('文章CLIの対象owner境界', () => {
  it('明示IDでも期待ownerなしではDBに到達しない', async () => {
    vi.stubEnv('SKILLSHEET_OWNER_ID', '');
    const { db, execute, select } = database(null);
    await expect(resolveTargetSheetIds(db, ['--sheet-id', id])).rejects.toThrow('SKILLSHEET_OWNER_ID');
    expect(execute).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
  it('不存在と他ownerを示すNOT_FOUNDでは一覧にfallbackしない', async () => {
    vi.stubEnv('SKILLSHEET_OWNER_ID', 'owner');
    const { db, execute, select } = database({ status: 'NOT_FOUND' });
    await expect(resolveTargetSheetIds(db, [`--sheet-id=${id}`])).rejects.toThrow('NOT_FOUND');
    expect(execute).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
  });
  it('対象のsnapshotからIDを返し基表を読まない', async () => {
    vi.stubEnv('SKILLSHEET_OWNER_ID', 'owner');
    const { db, execute, select } = database({
      status: 'OK',
      snapshot: { sheetId: id, title: '合成', revision: '0', blocks: [] },
    });
    expect(await resolveTargetSheetIds(db, ['--sheet-id', id])).toEqual([id]);
    expect(execute).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
  });
});

describe('候補作成のsnapshot整合性', () => {
  it('本文と巨大な文字列版を同じ読取から保持する', async () => {
    vi.stubEnv('SKILLSHEET_OWNER_ID', 'owner');
    const block = { id, type: 'markdown', order: 0, data: { markdown: '原文' } };
    const { db, execute, select } = database({
      status: 'OK',
      snapshot: { sheetId: id, title: '合成', revision: '9007199254740993', blocks: [block] },
    });
    expect(await readTargetBlocks(db, [id])).toEqual([{ ...block, sheetId: id, expectedRevision: '9007199254740993' }]);
    expect(execute).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
  });
  it('未知ブロックを除外して候補を続行しない', async () => {
    vi.stubEnv('SKILLSHEET_OWNER_ID', 'owner');
    const { db } = database({
      status: 'OK',
      snapshot: { sheetId: id, title: '合成', revision: '0', blocks: [{ id, type: 'future', order: 0, data: {} }] },
    });
    await expect(readTargetBlocks(db, [id])).rejects.toThrow('UNEDITABLE_DOCUMENT');
  });
});
