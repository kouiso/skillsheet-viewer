import { describe, expect, it } from 'vitest';
import { encodeMigrationRow, type MigrationTable } from './d1-migration-codec';
import { compareMigrationSnapshot, type MigrationLedger, type MigrationSnapshot } from './d1-migration-snapshot';

const origin = {
  project: 'fixture-project',
  database: 'fixture-database',
  branch: 'fixture-primary-branch',
  snapshot: 'fixture-consistent-snapshot',
};
const table: MigrationTable = {
  name: 'public.document_versions',
  columns: [
    { name: 'id', kind: 'revision', nullable: false },
    { name: 'value', kind: 'json', nullable: false },
    { name: 'at', kind: 'timestamp', nullable: false },
    { name: 'enabled', kind: 'boolean', nullable: true },
  ],
  primaryKey: ['id'],
};
const secretMarker = 'fixture-authentication-payload-must-not-be-logged';
const row = {
  id: '9007199254740993',
  value: `{"future":9007199254740993,"payload":"${secretMarker}"}`,
  at: '2026-10-22 20:30:40.123456+09',
  enabled: true,
};

function fixture() {
  const ledger: MigrationLedger = {
    origin: { ...origin },
    tables: [
      { table: structuredClone(table), disposition: 'migrate', state: 'present' },
      {
        table: { ...structuredClone(table), name: 'legacy.document_versions' },
        disposition: 'preserve',
        state: 'present',
      },
      {
        table: { ...structuredClone(table), name: 'public.deleted_documents' },
        disposition: 'migrate',
        state: 'not-installed',
      },
      {
        table: { ...structuredClone(table), name: 'public.empty_table' },
        disposition: 'migrate',
        state: 'present',
      },
    ],
  };
  const source: MigrationSnapshot = {
    origin: { ...origin },
    tables: [
      { name: table.name, state: 'present', rows: [structuredClone(row)] },
      { name: 'legacy.document_versions', state: 'present', rows: [structuredClone(row)] },
      { name: 'public.deleted_documents', state: 'not-installed' },
      { name: 'public.empty_table', state: 'present', rows: [] },
    ],
  };
  const migrated: MigrationSnapshot = {
    origin: { ...origin },
    tables: [
      { name: table.name, state: 'present', rows: [encodeMigrationRow(table, row)] },
      { name: 'public.deleted_documents', state: 'not-installed' },
      { name: 'public.empty_table', state: 'present', rows: [] },
    ],
  };
  const preserved: MigrationSnapshot = {
    origin: { ...origin },
    tables: [{ name: 'legacy.document_versions', state: 'present', rows: [structuredClone(row)] }],
  };
  return { ledger, source, migrated, preserved };
}
function check(input: ReturnType<typeof fixture>) {
  return compareMigrationSnapshot(input.ledger, input.source, input.migrated, input.preserved);
}
function rows(snapshot: MigrationSnapshot, name: string) {
  const found = snapshot.tables.find((entry) => entry.name === name);
  if (found?.state !== 'present') throw new Error('INVALID_TEST_FIXTURE');
  return found.rows;
}

describe('移行 snapshot の来歴・全表台帳・分離保全のオフライン照合', () => {
  it('移行表・分離保全表・未導入表・存在する空表を区別して全件照合する', () => {
    const input = fixture();
    const before = structuredClone(input);
    const report = check(input);
    expect(report).toMatchObject({
      matches: true,
      tableCount: 4,
      notInstalledTableCount: 1,
      migrated: { tableCount: 3, sourceRowCount: 1, targetRowCount: 1, changedRowCount: 0 },
      preserved: { tableCount: 1, sourceRowCount: 1, targetRowCount: 1, changedRowCount: 0 },
    });
    expect(report.ledgerChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(report.tables[0].comparison?.sourceChecksum).toBe(report.tables[0].comparison?.targetChecksum);
    expect(report.tables[1].comparison?.sourceChecksum).toBe(report.tables[1].comparison?.targetChecksum);
    expect(report.tables[2].comparison).toBeNull();
    expect(report.tables[3].comparison?.sourceCount).toBe(0);
    expect(input).toEqual(before);
  });

  it.each(['source', 'migrated', 'preserved'] as const)('%s の表の無断欠落を拒否する', (part) => {
    const input = fixture();
    input[part].tables.pop();
    expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_TABLE_SET_MISMATCH');
  });

  it.each(['source', 'migrated', 'preserved'] as const)('%s の余分な表を拒否する', (part) => {
    const input = fixture();
    input[part].tables.push({ name: 'unlisted.sensitive_table', state: 'present', rows: [] });
    expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_TABLE_SET_MISMATCH');
  });

  it.each(['source', 'migrated', 'preserved'] as const)('%s の表重複を拒否する', (part) => {
    const input = fixture();
    input[part].tables.push(structuredClone(input[part].tables[0]));
    expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_DUPLICATE_TABLE');
  });

  it('台帳の重複と無断除外も拒否する', () => {
    const duplicate = fixture();
    duplicate.ledger.tables.push(structuredClone(duplicate.ledger.tables[0]));
    expect(() => check(duplicate)).toThrow('MIGRATION_SNAPSHOT_DUPLICATE_TABLE');
    const excluded = fixture();
    excluded.ledger.tables.splice(1, 1);
    expect(() => check(excluded)).toThrow('MIGRATION_SNAPSHOT_TABLE_SET_MISMATCH');
  });

  it('分離保全表を移行表へ混合せず、同じ非修飾名の別schemaを別表として扱う', () => {
    const input = fixture();
    input.migrated.tables.push({
      name: 'legacy.document_versions',
      state: 'present',
      rows: [encodeMigrationRow(table, row)],
    });
    input.preserved.tables = [];
    expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_TABLE_SET_MISMATCH');
  });

  it.each(['project', 'database', 'branch', 'snapshot'] as const)('%s が違うコピーを拒否する', (field) => {
    for (const part of ['source', 'migrated', 'preserved'] as const) {
      const input = fixture();
      input[part].origin[field] = `different-${field}`;
      expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_ORIGIN_MISMATCH');
    }
    const input = fixture();
    input.ledger.origin[field] = `different-${field}`;
    expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_ORIGIN_MISMATCH');
  });

  it('同一来歴の保全コピーも実際の全行がなければ不一致にする', () => {
    const input = fixture();
    rows(input.preserved, 'legacy.document_versions').length = 0;
    expect(check(input)).toMatchObject({
      matches: false,
      migrated: { missingRowCount: 0 },
      preserved: { missingRowCount: 1, sourceRowCount: 1, targetRowCount: 0 },
    });
  });

  it('移行コピーと保全コピー両方のμs・巨大JSON数値の変化を検出する', () => {
    const input = fixture();
    rows(input.migrated, table.name)[0] = {
      ...encodeMigrationRow(table, row),
      at: '2026-10-22T11:30:40.123457Z',
    };
    rows(input.preserved, 'legacy.document_versions')[0] = {
      ...row,
      value: row.value.replace('9007199254740993', '9007199254740992'),
    };
    expect(check(input)).toMatchObject({
      matches: false,
      migrated: { changedRowCount: 1 },
      preserved: { changedRowCount: 1 },
    });
  });

  it('同じ件数でも欠落PKと余分PKを集計し、重複PKを拒否する', () => {
    const input = fixture();
    rows(input.migrated, table.name)[0] = { ...encodeMigrationRow(table, row), id: '9007199254740994' };
    expect(check(input)).toMatchObject({
      matches: false,
      migrated: { missingRowCount: 1, unexpectedRowCount: 1, changedRowCount: 0 },
    });
    rows(input.preserved, 'legacy.document_versions').push(structuredClone(row));
    expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_INVALID_DATA');
  });

  it.each(['source', 'migrated'] as const)('空表と未導入表を %s で取り違えない', (part) => {
    const input = fixture();
    input[part].tables = input[part].tables.map((entry) =>
      entry.name === 'public.deleted_documents' ? { name: entry.name, state: 'present', rows: [] } : entry,
    );
    expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_PRESENCE_MISMATCH');
    const empty = fixture();
    empty[part].tables = empty[part].tables.map((entry) =>
      entry.name === 'public.empty_table' ? { name: entry.name, state: 'not-installed' } : entry,
    );
    expect(() => check(empty)).toThrow('MIGRATION_SNAPSHOT_PRESENCE_MISMATCH');
  });

  it('一覧順・行順だけでは一致判定や台帳の指紋を変えない', () => {
    const input = fixture();
    const second = { ...row, id: '9007199254740994' };
    rows(input.source, table.name).push(second);
    rows(input.migrated, table.name).unshift(encodeMigrationRow(table, second));
    const before = check(input);
    input.ledger.tables.reverse();
    input.source.tables.reverse();
    input.migrated.tables.reverse();
    input.preserved.tables.reverse();
    const after = check(input);
    expect(before.matches).toBe(true);
    expect(after.matches).toBe(true);
    expect(after.ledgerChecksum).toBe(before.ledgerChecksum);
    expect(after.migrated).toEqual(before.migrated);
  });

  it('別来歴・別の分離方針には別の台帳指紋を付ける', () => {
    const input = fixture();
    const before = check(input).ledgerChecksum;
    for (const value of [input.ledger, input.source, input.migrated, input.preserved]) value.origin.branch = 'other';
    expect(check(input).ledgerChecksum).not.toBe(before);
    const policy = fixture();
    policy.ledger.tables[3].disposition = 'preserve';
    policy.migrated.tables = policy.migrated.tables.filter((entry) => entry.name !== 'public.empty_table');
    policy.preserved.tables.push({ name: 'public.empty_table', state: 'present', rows: [] });
    expect(check(policy).matches).toBe(true);
    expect(check(policy).ledgerChecksum).not.toBe(before);
  });

  it('不正・曖昧な台帳を、未導入や空表だからと通さない', () => {
    for (const name of ['not_qualified', 'a.b.c', '"public"."table"']) {
      const input = fixture();
      input.ledger.tables[2].table.name = name;
      expect(() => check(input)).toThrow('MIGRATION_SNAPSHOT_INVALID_INPUT');
    }
    const invalidKey = fixture();
    invalidKey.ledger.tables[2].table.primaryKey = ['unknown_column'];
    expect(() => check(invalidKey)).toThrow('MIGRATION_SNAPSHOT_INVALID_DATA');
    expect(() => compareMigrationSnapshot({ origin, tables: [] }, {}, {}, {})).toThrow(
      'MIGRATION_SNAPSHOT_INVALID_INPUT',
    );
    const input = fixture();
    expect(() =>
      compareMigrationSnapshot({ ...input.ledger, exclude: ['secret'] }, input.source, input.migrated, input.preserved),
    ).toThrow('MIGRATION_SNAPSHOT_INVALID_INPUT');
  });

  it('成功・不一致の返り値と例外に行・PK・表名・来歴・秘密の入力を出さない', () => {
    const input = fixture();
    for (const report of [
      check(input),
      check({
        ...input,
        preserved: { ...input.preserved, tables: [{ name: 'legacy.document_versions', state: 'present', rows: [] }] },
      }),
    ]) {
      const diagnostic = JSON.stringify(report);
      for (const marker of [secretMarker, row.id, table.name, origin.project, origin.branch, origin.snapshot])
        expect(diagnostic).not.toContain(marker);
    }
    const malformed = { ...input.source, origin: { ...origin, password: secretMarker } };
    expect(() => compareMigrationSnapshot(input.ledger, malformed, input.migrated, input.preserved)).toThrow(
      /^MIGRATION_SNAPSHOT_INVALID_INPUT$/,
    );
    rows(input.source, table.name)[0] = { ...row, value: secretMarker };
    expect(() => check(input)).toThrow(/^MIGRATION_SNAPSHOT_INVALID_DATA$/);
  });
});
