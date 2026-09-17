import { describe, expect, it, vi } from 'vitest';
import { readReproDocument } from './read-document';

const id = '00000000-0000-4000-8000-000000000001';
function database(blocks: unknown[]) {
  return {
    execute: vi.fn().mockResolvedValue({
      rows: [
        { result: { status: 'OK', snapshot: { sheetId: id, title: '合成', revision: '9007199254740993', blocks } } },
      ],
    }),
  };
}
describe('手動PDF再現の原文読取', () => {
  it('同じsnapshotの本文・ID・文字列版を保持する', async () => {
    const db = database([{ id, type: 'markdown', order: 0, data: { markdown: '原文' } }]);
    const result = await readReproDocument(db, 'owner', id, 24320);
    expect(result).toMatchObject({ sheetId: id, revision: '9007199254740993', content: '原文', referenceMonth: 24320 });
    expect(db.execute).toHaveBeenCalledOnce();
  });
  it('読めないブロックを落としてPDF検査へ進まない', async () => {
    const db = database([{ id, type: 'future', order: 0, data: {} }]);
    await expect(readReproDocument(db, 'owner', id, 24320)).rejects.toThrow('UNREADABLE_DOCUMENT');
  });
  it('他owner・不存在では既定へ切り替えない', async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [{ result: { status: 'NOT_FOUND' } }] }) };
    await expect(readReproDocument(db, 'owner', id, 24320)).rejects.toThrow('NOT_FOUND');
    expect(db.execute).toHaveBeenCalledOnce();
  });
});

it.each([NaN, -1, 24320.5])('不正な固定月%sではDBへ接続しない', async (month) => {
  const db = database([]);
  await expect(readReproDocument(db, 'owner', id, month)).rejects.toThrow('INVALID_REFERENCE_MONTH');
  expect(db.execute).not.toHaveBeenCalled();
});
