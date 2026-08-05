import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dbHolder: unknown;
vi.mock('./client', () => ({ getDb: () => dbHolder }));

import { createSheet } from './skillsheet';

// drizzle のクエリビルダは chainable かつ await 可能（thenable）。実 DB 無しで
// その挙動を模すため、意図的に then を持つフェイクを返す（noThenProperty は許容する）。
const thenable = (result: unknown) => ({
  // biome-ignore lint/suspicious/noThenProperty: drizzle ビルダの await 可能な挙動を模すフェイク
  then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej),
});

function createFakeDb(insertedSheetId: string) {
  const insertValues = vi.fn((_values: unknown[]) => thenable(undefined));
  const tx = {
    insert: vi.fn(() => {
      // 最初の insert は skillSheets（returning が要る）、2 回目以降は blocks（values のみ）。
      if (tx.insert.mock.calls.length === 1) {
        return { values: () => ({ returning: () => thenable([{ id: insertedSheetId }]) }) };
      }
      return { values: insertValues };
    }),
  };
  const db = { transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  return { db, insertValues };
}

let savedOwner: string | undefined;

beforeEach(() => {
  savedOwner = process.env.SKILLSHEET_OWNER_ID;
  process.env.SKILLSHEET_OWNER_ID = 'owner-1';
});

afterEach(() => {
  if (savedOwner === undefined) delete process.env.SKILLSHEET_OWNER_ID;
  else process.env.SKILLSHEET_OWNER_ID = savedOwner;
});

describe('createSheet', () => {
  it('テンプレ由来の空ブロックも drop せず insert する（issue #128）', async () => {
    const f = createFakeDb('sheet-new');
    dbHolder = f.db;
    const initialBlocks = [
      { type: 'markdown' as const, data: { markdown: '## 職務経歴' } },
      { type: 'experience' as const, data: { company: '', startDate: '', endDate: '', role: '', description: '' } },
    ];
    const sheetId = await createSheet('フルスキルシート', initialBlocks);
    expect(sheetId).toBe('sheet-new');
    expect(f.insertValues).toHaveBeenCalledTimes(1);
    const inserted = f.insertValues.mock.calls[0][0];
    expect(inserted).toHaveLength(2);
  });

  it('initialBlocks が空配列なら blocks insert を呼ばない', async () => {
    const f = createFakeDb('sheet-blank');
    dbHolder = f.db;
    const sheetId = await createSheet('空白', []);
    expect(sheetId).toBe('sheet-blank');
    expect(f.insertValues).not.toHaveBeenCalled();
  });
});
