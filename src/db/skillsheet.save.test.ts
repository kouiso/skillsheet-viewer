import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dbHolder: unknown;
vi.mock('./client', () => ({ getDb: () => dbHolder }));

import { ConflictError, deleteSheet, saveSkillSheetBlocks, UnreadableBlocksError } from './skillsheet';

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

function createFakeDb(opts: { selectResults: unknown[][]; updateReturning: unknown[]; deleteReturning?: unknown[] }) {
  const insertValues = vi.fn(() => thenable(undefined));
  let idx = 0;
  const tx = {
    select: vi.fn(() => selectChain(opts.selectResults[idx++] ?? [])),
    // where() の結果は await される（全置換削除）ことも、.returning() が続く
    // （deleteSheet の is_default 取得）こともあるので両方を満たす形にする。
    delete: vi.fn(() => ({
      where: () => ({ ...thenable(undefined), returning: () => thenable(opts.deleteReturning ?? []) }),
    })),
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

  it('空ブロックのみでも drop せず insert する（issue #128: テンプレの空スカフォールドを残す）', async () => {
    const saved = new Date('2026-03-01T00:00:00.000Z');
    const f = createFakeDb({ selectResults: [[{ id: 'sheet-x' }]], updateReturning: [{ updatedAt: saved }] });
    dbHolder = f.db;
    const res = await saveSkillSheetBlocks('T', [{ type: 'markdown', data: { markdown: '   ' } }], 'sheet-x');
    expect(res.updatedAt).toBe(saved);
    expect(f.insertValues).toHaveBeenCalledTimes(1);
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

  it('DB ドライバーが updatedAt を ISO 文字列で返しても競合を正しく判定する', async () => {
    const older = new Date('2026-01-01T00:00:00.000Z');
    const newer = new Date('2026-02-01T00:00:00.000Z');
    dbHolder = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }], [{ updatedAt: newer.toISOString() }]],
      updateReturning: [],
    }).db;
    await expect(saveSkillSheetBlocks('T', [MD], 'sheet-x', older)).rejects.toBeInstanceOf(ConflictError);
  });

  it('正本に読み取れないブロックが残っていると全置換を拒否する（M08: 見えない元データを消さない）', async () => {
    const f = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }], [{ id: 'bad-1', type: 'markdown', data: { broken: true } }]],
      updateReturning: [],
    });
    dbHolder = f.db;
    const err = await saveSkillSheetBlocks('T', [MD], 'sheet-x').catch((e) => e);
    expect(err).toBeInstanceOf(UnreadableBlocksError);
    expect((err as UnreadableBlocksError).blockIds).toEqual(['bad-1']);
    // delete→insert へ進まないので元行は温存される
    expect(f.tx.delete).not.toHaveBeenCalled();
    expect(f.insertValues).not.toHaveBeenCalled();
  });

  it('DB ドライバーが更新後の updatedAt を ISO 文字列で返しても Date として返す', async () => {
    const saved = new Date('2026-05-01T00:00:00.000Z');
    const f = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }]],
      updateReturning: [{ updatedAt: saved.toISOString() }],
    });
    dbHolder = f.db;
    const res = await saveSkillSheetBlocks('T', [MD], 'sheet-x');
    expect(res.updatedAt).toBeInstanceOf(Date);
    expect(res.updatedAt.getTime()).toBe(saved.getTime());
  });
});

describe('deleteSheet', () => {
  it('既定シートを削除したら同一トランザクション内で残りの最古シートを既定へ昇格する（S09）', async () => {
    const f = createFakeDb({
      selectResults: [[{ id: 'sheet-oldest' }]],
      updateReturning: [],
      deleteReturning: [{ isDefault: true }],
    });
    dbHolder = f.db;
    await deleteSheet('sheet-default');
    expect(f.tx.delete).toHaveBeenCalledTimes(1);
    expect(f.tx.update).toHaveBeenCalledTimes(1);
  });

  it('非既定シートの削除では昇格しない', async () => {
    const f = createFakeDb({
      selectResults: [],
      updateReturning: [],
      deleteReturning: [{ isDefault: false }],
    });
    dbHolder = f.db;
    await deleteSheet('sheet-sub');
    expect(f.tx.delete).toHaveBeenCalledTimes(1);
    expect(f.tx.select).not.toHaveBeenCalled();
    expect(f.tx.update).not.toHaveBeenCalled();
  });

  it('既定削除で残りシートが 0 枚なら昇格せず既定 0 枚のまま終わる', async () => {
    const f = createFakeDb({
      selectResults: [[]],
      updateReturning: [],
      deleteReturning: [{ isDefault: true }],
    });
    dbHolder = f.db;
    await deleteSheet('sheet-default');
    expect(f.tx.update).not.toHaveBeenCalled();
  });
});
