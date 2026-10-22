import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  compareMigrationTable,
  decodeMigrationRow,
  encodeMigrationRow,
  type MigrationKind,
  type MigrationTable,
} from './d1-migration-codec';
import fixture from './fixture/d1-migration.json';

const history: MigrationTable = {
  ...fixture.tables[0].table,
  columns: fixture.tables[0].table.columns.map((column) => ({ ...column, kind: column.kind as MigrationKind })),
};
const original = fixture.tables[0].rows[0];
function one(kind: MigrationKind, nullable = false): MigrationTable {
  return {
    name: 'fixture.type_boundary',
    columns: [{ name: 'value', kind, nullable }],
    primaryKey: nullable ? [] : ['value'],
  };
}

describe('Postgres → D1 移行用のオフライン境界', () => {
  it('複合PKと全版・復元参照・未知JSONを保持する', () => {
    const rows = fixture.tables[0].rows;
    const encoded = rows.map((row) => encodeMigrationRow(history, row));
    expect(encoded[0].revision).toBe('9007199254740993');
    expect(encoded[0].transaction_id).toBe('9223372036854775807');
    expect(encoded[0].recorded_at).toBe('2026-10-22T11:30:40.123456Z');
    expect(encoded[0].blocks).toContain('9007199254740993');
    expect(encoded[1].restored_from).toBe('9007199254740993');
    const result = compareMigrationTable(history, rows, [...encoded].reverse());
    expect(result.matches).toBe(true);
    expect(result.sourceCount).toBe(2);
    expect(result.sourceChecksum).toBe(result.targetChecksum);
  });

  it('1μs・unsafe整数の1差・owner・未知項目欠落を差分として検出する', () => {
    for (const change of [
      { recorded_at: '2026-10-22T11:30:40.123457Z' },
      { transaction_id: '9223372036854775806' },
      { owner_id: 'fixture-owner-b' },
      { blocks: '[]' },
    ]) {
      const result = compareMigrationTable(
        history,
        [original],
        [{ ...encodeMigrationRow(history, original), ...change }],
      );
      expect(result).toMatchObject({ matches: false, missingCount: 0, unexpectedCount: 0, changedCount: 1 });
      expect(result.sourceChecksum).not.toBe(result.targetChecksum);
      expect(JSON.stringify(result)).not.toContain('fixture-owner');
    }
  });

  it('同じ件数でも主キー差を見逃さず、列や重複を拒否する', () => {
    const encoded = encodeMigrationRow(history, original);
    expect(compareMigrationTable(history, [original], [{ ...encoded, revision: '9007199254740994' }])).toMatchObject({
      matches: false,
      sourceCount: 1,
      targetCount: 1,
      missingCount: 1,
      unexpectedCount: 1,
    });
    expect(() => compareMigrationTable(history, [original, original], [])).toThrow('MIGRATION_DUPLICATE_PRIMARY_KEY');
    expect(() => compareMigrationTable(history, [], [encoded, encoded])).toThrow('MIGRATION_DUPLICATE_PRIMARY_KEY');
    expect(() => encodeMigrationRow(history, { ...original, extra: 'must-not-disappear' })).toThrow(
      'MIGRATION_COLUMN_MISMATCH',
    );
    const missing = Object.fromEntries(Object.entries(original).filter(([name]) => name !== 'title'));
    expect(() => encodeMigrationRow(history, missing)).toThrow('MIGRATION_COLUMN_MISMATCH');
    expect(() => encodeMigrationRow(history, { ...original, title: null })).toThrow('MIGRATION_NULL_NOT_ALLOWED');
    expect(() => encodeMigrationRow(history, { ...original, revision: 9007199254740992 })).toThrow(
      'MIGRATION_EXPECTED_RAW_TEXT',
    );
  });

  it('主キーの区切り文字で別行を同一視しない', () => {
    const table: MigrationTable = {
      name: 'fixture.key',
      columns: [
        { name: 'a', kind: 'text', nullable: false },
        { name: 'b', kind: 'text', nullable: false },
      ],
      primaryKey: ['a', 'b'],
    };
    const rows = [
      { a: 'x\u0000y', b: 'z' },
      { a: 'x', b: 'y\u0000z' },
    ];
    expect(compareMigrationTable(table, rows, rows).sourceCount).toBe(2);
  });

  it('SQL NULL / JSON null / 空配列 / false を区別する', () => {
    const table: MigrationTable = {
      name: 'fixture.null',
      columns: [
        { name: 'id', kind: 'integer', nullable: false },
        { name: 'json', kind: 'json', nullable: true },
        { name: 'array', kind: 'text-array', nullable: true },
        { name: 'boolean', kind: 'boolean', nullable: true },
      ],
      primaryKey: ['id'],
    };
    const raw = [
      { id: 1, json: null, array: null, boolean: null },
      { id: 2, json: 'null', array: '[]', boolean: false },
      { id: 3, json: '{}', array: '[null,"", "read", "read"]', boolean: true },
    ];
    const encoded = raw.map((row) => encodeMigrationRow(table, row));
    expect(encoded[0]).toEqual(raw[0]);
    expect(encoded[1]).toEqual({ id: 2, json: 'null', array: '[]', boolean: 0 });
    expect(encoded[2].array).toBe('[null,"","read","read"]');
    expect(compareMigrationTable(table, raw, encoded).matches).toBe(true);
    expect(() => encodeMigrationRow(table, { ...raw[1], boolean: 0 })).toThrow('MIGRATION_INVALID_BOOLEAN');
    expect(() => encodeMigrationRow(table, raw[1], 'd1')).toThrow('MIGRATION_INVALID_BOOLEAN');
    expect(compareMigrationTable(table, [raw[0]], [{ ...encoded[0], json: 'null' }]).changedCount).toBe(1);
    expect(encoded.map((row) => decodeMigrationRow(table, row))).toEqual([
      raw[0],
      raw[1],
      { ...raw[2], array: '[null,"","read","read"]' },
    ]);
  });

  it('逆移送用の行にも64bit・μs・未知JSONを保持し、D1の不正な型を黙って直さない', () => {
    const target = encodeMigrationRow(history, original);
    const restored = decodeMigrationRow(history, target);
    expect(restored.revision).toBe('9007199254740993');
    expect(restored.transaction_id).toBe('9223372036854775807');
    expect(restored.recorded_at).toBe('2026-10-22T11:30:40.123456Z');
    expect(restored.blocks).toContain('9007199254740993');
    expect(compareMigrationTable(history, [restored], [target]).matches).toBe(true);
    expect(() => decodeMigrationRow(history, { ...target, revision: 9007199254740992 })).toThrow(
      'MIGRATION_EXPECTED_RAW_TEXT',
    );
    expect(() => decodeMigrationRow(one('boolean'), { value: '1' })).toThrow('MIGRATION_INVALID_BOOLEAN');
    expect(() => decodeMigrationRow(one('boolean'), { value: 2 })).toThrow('MIGRATION_INVALID_BOOLEAN');
  });

  it.each([
    '-9223372036854775808',
    '0',
    '9007199254740993',
    '9223372036854775807',
  ])('int64 %s を文字列で保持する', (value) => {
    expect(encodeMigrationRow(one('int64'), { value }).value).toBe(value);
  });
  it.each([
    '9223372036854775808',
    '-9223372036854775809',
    '01',
    '+1',
    '-0',
    '1e3',
    '',
  ])('int64 %s を拒否する', (value) => {
    expect(() => encodeMigrationRow(one('int64'), { value })).toThrow('MIGRATION_INVALID_INT64');
  });
  it('revision は負数を拒否し、int32 の範囲外・小数・NaNも拒否する', () => {
    expect(() => encodeMigrationRow(one('revision'), { value: '-1' })).toThrow('MIGRATION_INVALID_INT64');
    for (const value of [2147483648, -2147483649, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '1'])
      expect(() => encodeMigrationRow(one('integer'), { value })).toThrow('MIGRATION_INVALID_INTEGER');
  });

  it.each([
    ['1969-12-31T23:59:59.999999Z', '1969-12-31T23:59:59.999999Z'],
    ['2000-02-29 09:00:00.1+09:00', '2000-02-29T00:00:00.100000Z'],
    ['2026-10-22T00:00:00.000001-0530', '2026-10-22T05:30:00.000001Z'],
    ['9999-12-31T23:59:59.999999Z', '9999-12-31T23:59:59.999999Z'],
    ['0001-01-01T00:00:00Z', '0001-01-01T00:00:00.000000Z'],
  ])('日時 %s はμs精度で正規化する', (value, expected) => {
    expect(encodeMigrationRow(one('timestamp'), { value }).value).toBe(expected);
  });
  it.each([
    '2026-02-29T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:00:00',
    'infinity',
    '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00.1234567Z',
    '2026-01-01T00:00:00+16',
    '0000-01-01T00:00:00Z',
  ])('日時 %s は丸め・推測せず拒否する', (value) => {
    expect(() => encodeMigrationRow(one('timestamp'), { value })).toThrow('MIGRATION_INVALID_TIMESTAMP');
  });

  it('すでにparseしたJSON、多次元配列、非文字列配列、重複列、不正PKを拒否する', () => {
    expect(() => encodeMigrationRow(one('json'), { value: {} })).toThrow('MIGRATION_EXPECTED_RAW_TEXT');
    for (const value of ['[["a"]]', '[1]', '{}'])
      expect(() => encodeMigrationRow(one('text-array'), { value })).toThrow('MIGRATION_INVALID_ARRAY');
    expect(() => encodeMigrationRow(one('uuid-array'), { value: '["bad-id"]' })).toThrow('MIGRATION_INVALID_UUID');
    expect(() => encodeMigrationRow(one('uuid'), { value: 'bad-id' })).toThrow('MIGRATION_INVALID_UUID');
    expect(() => encodeMigrationRow(one('text', true), { value: null })).toThrow('MIGRATION_INVALID_TABLE');
    expect(() =>
      encodeMigrationRow({ ...history, columns: [...history.columns, history.columns[0]] }, original),
    ).toThrow('MIGRATION_INVALID_TABLE');
    expect(() => encodeMigrationRow({ ...history, primaryKey: ['not_a_column'] }, original)).toThrow(
      'MIGRATION_INVALID_TABLE',
    );
  });

  it('合成の履歴・削除再送防止・principals・旧migration台帳をSQLite TEXTへ往復して照合する', () => {
    for (const entry of fixture.tables) {
      const table: MigrationTable = {
        ...entry.table,
        columns: entry.table.columns.map((column) => ({ ...column, kind: column.kind as MigrationKind })),
      };
      const rows = entry.rows.map((row) => encodeMigrationRow(table, row));
      // D1 の実行試験ではなく、SQLite の型 affinity で64bit文字列が数値へ戻らないことの独立検証。
      const restored: unknown[] = JSON.parse(
        execFileSync(
          'python3',
          [
            '-c',
            `
import json, sqlite3, sys
data = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
columns = data['table']['columns']
quote = lambda name: '"' + name.replace('"', '""') + '"'
definitions = [quote(c['name']) + (' INTEGER' if c['kind'] in ('integer', 'boolean') else ' TEXT') + ('' if c['nullable'] else ' NOT NULL') for c in columns]
definitions.append('PRIMARY KEY (' + ','.join(quote(k) for k in data['table']['primaryKey']) + ')')
db.execute('CREATE TABLE fixture (' + ','.join(definitions) + ') STRICT')
db.executemany('INSERT INTO fixture VALUES (' + ','.join('?' for c in columns) + ')', [[row[c['name']] for c in columns] for row in data['rows']])
print(json.dumps([dict(row) for row in db.execute('SELECT * FROM fixture')]))
`,
          ],
          { input: JSON.stringify({ table, rows }), encoding: 'utf8' },
        ),
      );
      const result = compareMigrationTable(table, entry.rows, restored);
      expect(result.matches, table.name).toBe(true);
      expect(result.sourceChecksum).toBe(result.targetChecksum);
      const rollbackRows = restored.map((row) => decodeMigrationRow(table, row));
      expect(compareMigrationTable(table, rollbackRows, rows).matches, table.name).toBe(true);
    }
  });
});
