import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client';
import { writeBlockUpdates } from './block-write';

describe('legacy document writer gate', () => {
  it.each([undefined, '0', '1'])('期待版%sでも未移行writerからDBへ到達しない', async (expectedRevision) => {
    const transaction = vi.fn();
    const select = vi.fn();
    const db = { transaction, select } as unknown as Database;
    await expect(
      writeBlockUpdates(db, [
        { id: 'block', sheetId: 'sheet', expectedRevision, previous: {}, data: { text: 'change' } },
      ]),
    ).rejects.toThrow('LEGACY_WRITER_DISABLED');
    expect(transaction).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
  it('変更なしのdry-run結果はDBなしで返す', async () => {
    expect(await writeBlockUpdates({} as Database, [])).toEqual({ written: 0, skipped: 0, sheets: 0 });
  });
});
