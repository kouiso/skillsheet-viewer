import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dbHolder: unknown;
vi.mock('./client', () => ({ getDb: () => dbHolder }));

import {
  ConflictError,
  deleteSheet,
  MissingRevisionError,
  saveSkillSheetBlocks,
  UnreadableBlocksError,
} from './skillsheet';

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

function createFakeDb(opts: {
  selectResults: unknown[][];
  updateReturning: unknown[];
  deleteReturning?: unknown[];
  insertedSheetId?: string;
}) {
  // insert().values() は用途により thenable / .onConflictDoNothing() /
  // .onConflictDoNothing().returning() / .returning() のいずれでも呼ばれる。
  const insertValues = vi.fn((_values: unknown) => {
    const base: Record<string, unknown> = {
      onConflictDoNothing: () => ({
        ...thenable(undefined),
        returning: () => thenable(opts.insertedSheetId ? [{ id: opts.insertedSheetId }] : []),
      }),
      returning: () => thenable(opts.insertedSheetId ? [{ id: opts.insertedSheetId }] : []),
    };
    // biome-ignore lint/suspicious/noThenProperty: drizzle ビルダの await 可能な挙動を模すフェイク
    (base as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(undefined).then(res, rej);
    return base;
  });
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
      set: () => ({
        where: () => ({ ...thenable(undefined), returning: () => thenable(opts.updateReturning) }),
      }),
    })),
    execute: vi.fn().mockResolvedValue(undefined),
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
    await expect(saveSkillSheetBlocks('T', [MD], 'sheet-x', 1)).rejects.toThrow('Forbidden');
  });

  it('既存シートへの更新で期待版が無ければ MissingRevisionError を throw する（R01: 版なし更新を拒否）', async () => {
    const f = createFakeDb({ selectResults: [[{ id: 'sheet-x' }]], updateReturning: [] });
    dbHolder = f.db;
    await expect(saveSkillSheetBlocks('T', [MD], 'sheet-x')).rejects.toBeInstanceOf(MissingRevisionError);
    // 版なしではシート行の更新自体も行わない
    expect(f.tx.update).not.toHaveBeenCalled();
  });

  it('期待版と DB の版が一致しなければ ConflictError を throw する（古い版・未来版・不一致）', async () => {
    dbHolder = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }]],
      updateReturning: [], // CAS の条件付き UPDATE が 0 行 = 版不一致
    }).db;
    await expect(saveSkillSheetBlocks('T', [MD], 'sheet-x', 3)).rejects.toBeInstanceOf(ConflictError);
  });

  it('保存成功時はサーバ採番の新版番号を返す', async () => {
    const saved = new Date('2026-03-01T00:00:00.000Z');
    const f = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }], []],
      updateReturning: [{ updatedAt: saved, revision: 6 }],
    });
    dbHolder = f.db;
    const res = await saveSkillSheetBlocks('T', [MD], 'sheet-x', 5);
    expect(res.updatedAt).toBe(saved);
    expect(res.revision).toBe(6);
  });

  it('空ブロックのみでも drop せず insert する（issue #128: テンプレの空スカフォールドを残す）', async () => {
    const f = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }], []],
      updateReturning: [{ updatedAt: new Date(), revision: 2 }],
    });
    dbHolder = f.db;
    await saveSkillSheetBlocks('T', [{ type: 'markdown', data: { markdown: '   ' } }], 'sheet-x', 1);
    // ブロック insert が 1 回（state/sheet ではなく blocks への insert）
    const blockInsert = f.insertValues.mock.calls.map((c) => c[0]).find((v) => Array.isArray(v));
    expect(blockInsert).toHaveLength(1);
  });

  it('正本に読み取れないブロックが残っていると全置換を拒否する（M08: 見えない元データを消さない）', async () => {
    const f = createFakeDb({
      selectResults: [[{ id: 'sheet-x' }], [{ id: 'bad-1', type: 'markdown', data: { broken: true } }]],
      updateReturning: [{ updatedAt: new Date(), revision: 2 }],
    });
    dbHolder = f.db;
    const err = await saveSkillSheetBlocks('T', [MD], 'sheet-x', 1).catch((e) => e);
    expect(err).toBeInstanceOf(UnreadableBlocksError);
    expect((err as UnreadableBlocksError).blockIds).toEqual(['bad-1']);
    // delete→insert へ進まないので元行は温存される
    expect(f.tx.delete).not.toHaveBeenCalled();
  });

  it('sheetId 省略で既定シートが無ければ新規作成し、初期版で保存できる（作成は版不要）', async () => {
    const f = createFakeDb({
      // getOrCreateDefaultSheetId: 既定なし → 最古なし → insert
      selectResults: [[], [], []],
      updateReturning: [{ updatedAt: new Date(), revision: 2 }],
      insertedSheetId: 'sheet-new',
    });
    dbHolder = f.db;
    const res = await saveSkillSheetBlocks('T', [MD]);
    expect(res.revision).toBe(2);
  });

  it('sheetId 省略で既定シートが既にあれば既存更新となり版は必須', async () => {
    const f = createFakeDb({
      selectResults: [[{ id: 'sheet-default' }]],
      updateReturning: [],
    });
    dbHolder = f.db;
    await expect(saveSkillSheetBlocks('T', [MD])).rejects.toBeInstanceOf(MissingRevisionError);
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

  it('削除の書込経路では skillsheet_state を upsert して「初期化済み」を確定する（S09: 全削除後の seed 復活防止）', async () => {
    const f = createFakeDb({
      selectResults: [[]],
      updateReturning: [],
      deleteReturning: [{ isDefault: true }],
    });
    dbHolder = f.db;
    await deleteSheet('sheet-default');
    // insert の最初の呼び出しは skillsheet_state への upsert
    expect(f.tx.insert).toHaveBeenCalled();
    expect(f.insertValues).toHaveBeenNthCalledWith(1, { ownerId: 'owner-1' });
  });
});
