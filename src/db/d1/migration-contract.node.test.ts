import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { z } from 'zod';
import { compareMigrationTable, decodeMigrationRow, encodeMigrationRow } from '../../../script/d1-migration-codec';
import { migrationTableSchema } from '../../../script/d1-migration-snapshot';
import fixture from '../../../script/fixture/d1-migration.json';
import { createDocumentService } from '../document-service';
import type { D1Binding } from './binding';
import { createD1DocumentStore } from './document-store';
import { readD1Json, writeD1Json } from './json-value';

// 移送側の実物fixtureとアプリDDLを同じローカルworkerdでつなぐ。実DBのexport/importではない。
const history = migrationTableSchema.parse(fixture.tables[0].table);
const state = migrationTableSchema.parse(fixture.tables[1].table);
const deleted = migrationTableSchema.parse(fixture.tables[2].table);
const sourceHistory = fixture.tables[0].rows;
const sourceState = fixture.tables[1].rows;
const { owner_id: owner, sheet_id: sourceSheet } = z
  .object({ owner_id: z.string(), sheet_id: z.string() })
  .parse(sourceHistory[0]);
const sheet = sourceSheet.toLowerCase();
let platform: PlatformProxy<{ DB: D1Binding }>;
let db: D1Binding;
const query = async (sql: string, ...values: (string | number | null)[]) =>
  (
    await db
      .prepare(sql)
      .bind(...values)
      .all()
  ).results;
const readHistory = () => query('SELECT * FROM document_versions');

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Binding }>({
    configPath: 'wrangler.d1.jsonc',
    envFiles: [],
    persist: false,
    remoteBindings: false,
  });
  db = platform.env.DB;
  const ddl = await readFile('src/db/d1/schema.sql', 'utf8');
  await db.batch(
    ddl
      .split(';')
      .filter((sql) => sql.trim())
      .map((sql) => db.prepare(sql)),
  );
}, 30_000);
afterAll(async () => {
  await platform?.dispose();
});
beforeEach(async () => {
  for (const table of [
    'blocks',
    'skill_sheets',
    'document_versions',
    'skillsheet_state',
    'deleted_documents',
    'd1_transactions',
  ])
    await query(`DELETE FROM ${table}`);
  for (const row of sourceHistory) {
    const encoded = encodeMigrationRow(history, row);
    await query(
      'INSERT INTO document_versions(sheet_id,owner_id,revision,title,blocks,action,recorded_at,transaction_id,restored_from,restored_before) VALUES(?,?,?,?,?,?,?,?,?,?)',
      ...history.columns.map((column) => encoded[column.name]),
    );
  }
  for (const row of sourceState) {
    const encoded = encodeMigrationRow(state, row);
    await query(
      'INSERT INTO skillsheet_state(owner_id,deleted_sheet_ids,initialized_at) VALUES(?,?,?)',
      ...state.columns.map((column) => encoded[column.name]),
    );
  }
});

describe('受領した移送codecとアプリD1境界の接続契約', () => {
  it('実アプリDDLへ合成fixtureをbindし、64bit・μs・未知JSON・削除台帳を全列照合する', async () => {
    const restored = await readHistory();
    expect(compareMigrationTable(history, sourceHistory, restored).matches).toBe(true);
    expect(compareMigrationTable(state, sourceState, await query('SELECT * FROM skillsheet_state')).matches).toBe(true);
    expect(compareMigrationTable(deleted, [], await query('SELECT * FROM deleted_documents')).matches).toBe(true);
    expect(restored.find((row) => row.revision === '9007199254740993')).toMatchObject({
      transaction_id: '9223372036854775807',
      recorded_at: '2026-10-22T11:30:40.123456Z',
    });
    expect(
      compareMigrationTable(
        history,
        restored.map((row) => decodeMigrationRow(history, row)),
        restored,
      ).matches,
    ).toBe(true);
    const changed = restored.map((row) => ({ ...row, transaction_id: '9223372036854775806' }));
    expect(compareMigrationTable(history, sourceHistory, changed).matches).toBe(false);
  });

  it('移送後の版へ2アプリから保存し、元履歴と操作識別・owner境界を保つ', async () => {
    const latest = z.object({ title: z.string(), revision: z.string() }).parse(sourceHistory[1]);
    await query(
      'INSERT INTO skill_sheets(id,owner_id,title,revision,is_default,created_at,updated_at) VALUES(?,?,?,?,1,?,?)',
      sheet,
      owner,
      latest.title,
      latest.revision,
      '2026-10-22T11:30:40.123456Z',
      '2026-10-22T11:30:40.123457Z',
    );
    const first = createDocumentService(createD1DocumentStore(db, owner), owner);
    const second = createDocumentService(createD1DocumentStore(db, owner), owner);
    expect(await first.replace(sheet, latest.revision, '合成の移送後更新', [])).toMatchObject({
      revision: '9007199254740995',
    });
    expect(await second.read(sheet)).toMatchObject({ status: 'OK', snapshot: { title: '合成の移送後更新' } });
    const concurrent = await Promise.allSettled([
      first.replace(sheet, '9007199254740995', '合成A', []),
      second.replace(sheet, '9007199254740995', '合成B', []),
    ]);
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === 'rejected')).toMatchObject([
      { reason: { code: 'CONFLICT' } },
    ]);
    const rows = await readHistory();
    const old = rows.filter((row) =>
      sourceHistory.some((source) => 'revision' in source && source.revision === row.revision),
    );
    expect(compareMigrationTable(history, sourceHistory, old).matches).toBe(true);
    const ids = rows.filter((row) => !old.includes(row)).map((row) => row.transaction_id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(typeof id).toBe('string');
      if (typeof id !== 'string') throw new Error('INVALID_FIXTURE_TRANSACTION');
      expect(BigInt(id)).toBeGreaterThanOrEqual(-9223372036854775808n);
      expect(BigInt(id)).toBeLessThan(0n);
    }
    expect(await query('SELECT * FROM d1_transactions')).toHaveLength(2);
    expect(
      compareMigrationTable(
        history,
        rows.map((row) => decodeMigrationRow(history, row)),
        rows,
      ).matches,
    ).toBe(true);
    const foreign = createDocumentService(createD1DocumentStore(db, 'fixture-owner-b'), 'fixture-owner-b');
    expect(await foreign.read(sheet)).toEqual({ status: 'NOT_FOUND' });
    await expect(foreign.replace(sheet, '9007199254740996', '偽装', [])).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('nullable JSONの移送値をraw DTOへ渡してもNULL・JSON null・false・空配列・巨大数値を混同しない', () => {
    const table = migrationTableSchema.parse({
      name: 'fixture.nullable_json',
      columns: [
        { name: 'id', kind: 'integer', nullable: false },
        { name: 'value', kind: 'json', nullable: true },
      ],
      primaryKey: ['id'],
    });
    const values = [null, 'null', 'false', '[]', '{"n":9007199254740993}'];
    const rows = values.map((value, id) => ({ id, value }));
    const encoded = rows.map((row) => encodeMigrationRow(table, row));
    const roundtrip = encoded.map((row) => ({ ...row, value: writeD1Json(readD1Json(row.value)) }));
    expect(readD1Json(roundtrip[0].value)).toEqual({ kind: 'sql-null' });
    expect(readD1Json(roundtrip[1].value)).toEqual({ kind: 'json', text: 'null' });
    expect(compareMigrationTable(table, rows, roundtrip).matches).toBe(true);
    expect(
      compareMigrationTable(
        table,
        rows,
        roundtrip.map((row) => ({ ...row, value: 'null' })),
      ).matches,
    ).toBe(false);
  });
});
