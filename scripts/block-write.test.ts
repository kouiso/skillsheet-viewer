import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { blocks } from '../src/db/schema';
import { type BlockUpdate, writeBlockUpdates } from './block-write';

const before = { text: 'before' };
const after = { text: 'after' };
const update: BlockUpdate = { id: 'block-a', sheetId: 'sheet-a', previous: before, data: after };

// 外部DBを使わず、トランザクションのコミットとロールバックを再現する。
function database(rows = [{ id: 'block-a', sheetId: 'sheet-a', data: before }], failAt = 0) {
  let committed = structuredClone(rows);
  let sheetWrites = 0;
  let queries = 0;
  const dialect = new PgDialect();
  const conditions: string[] = [];
  const db = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const draft = structuredClone(committed);
      let writes = 0;
      let pendingSheetWrites = 0;
      const tx = {
        select: () => ({
          from: (table: unknown) => ({
            where: () => {
              queries++;
              if (table === blocks) return Promise.resolve(draft);
              const result = [{ id: 'sheet-a', updatedAt: new Date(1) }];
              return { for: () => Promise.resolve(result), orderBy: () => ({ for: () => Promise.resolve(result) }) };
            },
          }),
        }),
        update: (table: unknown) => ({
          set: (value: { data: typeof before }) => ({
            where: async (condition: Parameters<PgDialect['sqlToQuery']>[0]) => {
              const query = dialect.sqlToQuery(condition);
              conditions.push(query.sql);
              if (table !== blocks) {
                pendingSheetWrites++;
                return;
              }
              if (++writes === failAt) throw new Error('simulated write failure');
              const row = draft.find((item) => item.id === query.params[0]);
              if (row) row.data = value.data;
            },
          }),
        }),
      };
      const result = await run(tx);
      committed = draft;
      sheetWrites += pendingSheetWrites;
      return result;
    },
  } as unknown as Database;
  return { db, rows: () => committed, sheetWrites: () => sheetWrites, queries: () => queries, conditions };
}

describe('writeBlockUpdates', () => {
  it('更新時に所属シートも条件とし、再実行では更新時刻を進めない', async () => {
    const state = database();
    expect(await writeBlockUpdates(state.db, [update])).toEqual({ written: 1, skipped: 0, sheets: 1 });
    expect(state.conditions[0]).toContain('sheet_id');
    expect(await writeBlockUpdates(state.db, [update])).toEqual({ written: 0, skipped: 1, sheets: 0 });
    expect(state.sheetWrites()).toBe(1);
  });

  it.each([
    ['削除済み', []],
    ['別シートへ移動済み', [{ id: 'block-a', sheetId: 'other', data: before }]],
    ['別編集済み', [{ id: 'block-a', sheetId: 'sheet-a', data: { text: 'other' } }]],
  ])('%s のブロックを上書きしない', async (_name, rows) => {
    const state = database(rows);
    await expect(writeBlockUpdates(state.db, [update])).rejects.toThrow();
    expect(state.rows()).toEqual(rows);
    expect(state.sheetWrites()).toBe(0);
  });

  it('提案と変更前が同値でもDB競合を確認する', async () => {
    const state = database([{ id: 'block-a', sheetId: 'sheet-a', data: after }]);
    await expect(writeBlockUpdates(state.db, [{ ...update, data: before }])).rejects.toThrow();
    expect(state.queries()).toBeGreaterThan(0);
  });

  it('変更前時刻の不一致は拒否し、成功済み再実行は許可する', async () => {
    const state = database();
    await expect(writeBlockUpdates(state.db, [{ ...update, expectedUpdatedAt: new Date(2) }])).rejects.toThrow(
      'Concurrent',
    );
    expect(state.rows()[0].data).toEqual(before);
    await writeBlockUpdates(state.db, [{ ...update, expectedUpdatedAt: new Date(1) }]);
    expect(await writeBlockUpdates(state.db, [{ ...update, expectedUpdatedAt: new Date(0) }])).toEqual({
      written: 0,
      skipped: 1,
      sheets: 0,
    });
  });

  it('後続ブロックの競合があれば先行ブロックも更新しない', async () => {
    const rows = [
      { id: 'block-a', sheetId: 'sheet-a', data: before },
      { id: 'block-b', sheetId: 'sheet-a', data: { text: 'other' } },
    ];
    const state = database(rows);
    await expect(writeBlockUpdates(state.db, [update, { ...update, id: 'block-b' }])).rejects.toThrow('Concurrent');
    expect(state.rows()).toEqual(rows);
    expect(state.conditions).toEqual([]);
  });

  it('重複ブロックの曖昧な更新を拒否する', async () => {
    const state = database();
    await expect(writeBlockUpdates(state.db, [update, update])).rejects.toThrow('Duplicate');
    expect(state.queries()).toBe(0);
  });

  it('途中失敗では先行更新も戻る', async () => {
    const rows = [
      { id: 'block-a', sheetId: 'sheet-a', data: before },
      { id: 'block-b', sheetId: 'sheet-a', data: before },
    ];
    const state = database(rows, 2);
    await expect(writeBlockUpdates(state.db, [update, { ...update, id: 'block-b' }])).rejects.toThrow('simulated');
    expect(state.rows()).toEqual(rows);
    expect(state.sheetWrites()).toBe(0);
  });
});
