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

function selectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy', 'limit']) chain[m] = () => chain;
  // biome-ignore lint/suspicious/noThenProperty: drizzle ビルダの await 可能な挙動を模すフェイク
  (chain as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return chain;
}

function createFakeDb(insertedSheetId: string, opts: { defaultExists?: boolean } = {}) {
  // insert の呼び出し順: 1=skillsheet_state(ensureInitialized), 2=skill_sheets, 3以降=blocks。
  const insertValues = vi.fn((_values: unknown[]) => thenable(undefined));
  const stateValues = vi.fn((_values: unknown) => ({ onConflictDoNothing: () => thenable(undefined) }));
  const sheetValues = vi.fn((_values: unknown) => ({ returning: () => thenable([{ id: insertedSheetId }]) }));
  const tx = {
    // 既定シート存在チェック。指定が無ければ「既定あり」として振る舞う。
    select: vi.fn(() => selectChain(opts.defaultExists === false ? [] : [{ id: 'sheet-default' }])),
    insert: vi.fn(() => {
      const call = tx.insert.mock.calls.length;
      if (call === 1) return { values: stateValues };
      if (call === 2) return { values: sheetValues };
      return { values: insertValues };
    }),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  const db = { transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  return { db, insertValues, sheetValues, stateValues };
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

  it('既定シートが既にあるなら新規シートは isDefault=false で作る', async () => {
    const f = createFakeDb('sheet-new', { defaultExists: true });
    dbHolder = f.db;
    await createSheet('別シート', []);
    expect(f.sheetValues).toHaveBeenCalledWith(expect.objectContaining({ isDefault: false }));
  });

  it('既定シートが無いなら新規シートを isDefault=true で作る（書込経路で既定を確定する、S09）', async () => {
    const f = createFakeDb('sheet-first', { defaultExists: false });
    dbHolder = f.db;
    await createSheet('最初のシート', []);
    expect(f.sheetValues).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true }));
  });

  it('作成の書込経路では skillsheet_state を upsert する（S09: state 無しのシートを残さない）', async () => {
    const f = createFakeDb('sheet-new');
    dbHolder = f.db;
    await createSheet('新規', []);
    expect(f.stateValues).toHaveBeenCalledWith({ ownerId: 'owner-1' });
  });
});
