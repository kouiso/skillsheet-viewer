import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dbHolder: unknown;
vi.mock('./client', () => ({ getDb: () => dbHolder }));

import { ConflictError, saveSkillSheetBlocks } from './skillsheet';

// drizzle のクエリビルダは chainable かつ await 可能（thenable）。実 DB 無しで
// その挙動を模すため、意図的に then を持つフェイクを返す（noThenProperty は許容する）。
const thenable = (result: unknown) => ({
  // biome-ignore lint/suspicious/noThenProperty: drizzle ビルダの await 可能な挙動を模すフェイク
  then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej),
});

function selectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy', 'limit', 'for']) chain[m] = () => chain;
  // biome-ignore lint/suspicious/noThenProperty: drizzle ビルダの await 可能な挙動を模すフェイク
  (chain as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return chain;
}

function createFakeDb(opts: { selectResults: unknown[][]; updateReturning: unknown[] }) {
  const insertValues = vi.fn(() => thenable(undefined));
  let idx = 0;
  const tx = {
    select: vi.fn(() => selectChain(opts.selectResults[idx++] ?? [])),
    delete: vi.fn(() => ({ where: () => thenable(undefined) })),
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => ({
      set: () => ({ where: () => ({ returning: () => thenable(opts.updateReturning) }) }),
    })),
  };
  const db = { transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  return { db, tx, insertValues };
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

const MD = { type: 'markdown' as const, data: { markdown: 'hello' } };

describe('saveSkillSheetBlocks', () => {
  it('sheetId の所有者が一致しなければ Forbidden を throw する', async () => {
    dbHolder = createFakeDb({ selectResults: [[]], updateReturning: [] }).db;
    await expect(saveSkillSheetBlocks('T', [MD], 'sheet-x')).rejects.toThrow('Forbidden');
  });

  it('expectedUpdatedAt より新しい updatedAt なら ConflictError を throw する', async () => {
    const older = new Date('2026-01-01T00:00:00.000Z');
    const newer = new Date('2026-02-01T00:00:00.000Z');
    dbHolder = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }], [{ updatedAt: newer }]],
      updateReturning: [],
    }).db;
    await expect(saveSkillSheetBlocks('T', [MD], 'sheet-x', older)).rejects.toBeInstanceOf(ConflictError);
  });

  it('空ブロックのみのときは insert を呼ばずに drop し、updatedAt を返す', async () => {
    const saved = new Date('2026-03-01T00:00:00.000Z');
    const f = createFakeDb({ selectResults: [[{ id: 'sheet-x' }]], updateReturning: [{ updatedAt: saved }] });
    dbHolder = f.db;
    const res = await saveSkillSheetBlocks('T', [{ type: 'markdown', data: { markdown: '   ' } }], 'sheet-x');
    expect(res.updatedAt).toBe(saved);
    expect(f.insertValues).not.toHaveBeenCalled();
  });

  it('非空ブロックは insert され、サーバー時刻の updatedAt を返す', async () => {
    const saved = new Date('2026-04-01T00:00:00.000Z');
    const f = createFakeDb({ selectResults: [[{ id: 'sheet-x' }]], updateReturning: [{ updatedAt: saved }] });
    dbHolder = f.db;
    const res = await saveSkillSheetBlocks('T', [MD], 'sheet-x');
    expect(res.updatedAt).toBe(saved);
    expect(f.insertValues).toHaveBeenCalledTimes(1);
  });

  it('expectedUpdatedAt 以下の updatedAt なら競合とみなさず保存する', async () => {
    const older = new Date('2026-01-01T00:00:00.000Z');
    const newer = new Date('2026-02-01T00:00:00.000Z');
    const f = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }], [{ updatedAt: older }]],
      updateReturning: [{ updatedAt: newer }],
    });
    dbHolder = f.db;
    const res = await saveSkillSheetBlocks('T', [MD], 'sheet-x', newer);
    expect(res.updatedAt).toBe(newer);
  });
});
