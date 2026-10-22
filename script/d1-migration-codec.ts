import { createHash } from 'node:crypto';
import { canonicalMigrationJson } from './d1-migration-json';

export type MigrationKind =
  | 'text'
  | 'uuid'
  | 'integer'
  | 'int64'
  | 'revision'
  | 'boolean'
  | 'timestamp'
  | 'json'
  | 'text-array'
  | 'uuid-array';
export interface MigrationColumn {
  name: string;
  kind: MigrationKind;
  nullable: boolean;
}
export interface MigrationTable {
  // schema を含む元の識別子。SQL の生成には使わず、別 schema を同名表へ混ぜない。
  name: string;
  columns: readonly MigrationColumn[];
  primaryKey: readonly string[];
}
export type MigrationCell = string | number | null;
export type MigrationRow = Record<string, MigrationCell>;
type Source = 'postgres' | 'd1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = new Set<MigrationKind>([
  'text',
  'uuid',
  'integer',
  'int64',
  'revision',
  'boolean',
  'timestamp',
  'json',
  'text-array',
  'uuid-array',
]);

function fail(code: string): never {
  // 行・PK・列名にも機微情報が含まれ得る。失敗した値をログへ出さない。
  throw new Error(`MIGRATION_${code}`);
}
function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function timestamp(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
    value,
  );
  if (!match || match[1] === '0000') fail('INVALID_TIMESTAMP');
  const base = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
  const millis = Date.parse(`${base}.000Z`);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== `${base}.000Z`) fail('INVALID_TIMESTAMP');
  const zone = match[8];
  const hour = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const minute = zone.length <= 3 ? 0 : Number(zone.replace(':', '').slice(3, 5));
  if (hour > 15 || minute > 59) fail('INVALID_TIMESTAMP');
  const adjustment = BigInt((hour * 60 + minute) * (zone[0] === '-' ? -1 : 1)) * 60_000_000n;
  const micros = BigInt(millis) * 1000n + BigInt((match[7] ?? '').padEnd(6, '0')) - adjustment;
  // 負の epoch も余りを非負にそろえる。Date は秒までにだけ使い、端数は BigInt で保持する。
  const fraction = ((micros % 1_000_000n) + 1_000_000n) % 1_000_000n;
  const seconds = new Date(Number((micros - fraction) / 1000n)).toISOString();
  if (!/^\d{4}-/.test(seconds) || seconds.startsWith('0000-')) fail('UNSUPPORTED_TIMESTAMP');
  return `${seconds.slice(0, 19)}.${fraction.toString().padStart(6, '0')}Z`;
}

function cell(column: MigrationColumn, value: unknown, source: Source): MigrationCell {
  if (value === null) {
    if (!column.nullable) fail('NULL_NOT_ALLOWED');
    return null;
  }
  if (column.kind === 'boolean') {
    if (source === 'postgres' && typeof value === 'boolean') return value ? 1 : 0;
    if (source === 'd1' && (value === 0 || value === 1)) return value;
    return fail('INVALID_BOOLEAN');
  }
  if (column.kind === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647)
      fail('INVALID_INTEGER');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'string') fail('EXPECTED_RAW_TEXT');
  switch (column.kind) {
    case 'text':
      return value;
    case 'uuid':
      if (!uuid.test(value)) fail('INVALID_UUID');
      return value.toLowerCase();
    case 'int64':
    case 'revision': {
      if (!/^(0|-?[1-9][0-9]*)$/.test(value) || value.length > 20) fail('INVALID_INT64');
      const integer = BigInt(value);
      if (integer < (column.kind === 'revision' ? 0n : -9223372036854775808n) || integer > 9223372036854775807n)
        fail('INVALID_INT64');
      return value;
    }
    case 'timestamp':
      return timestamp(value);
    case 'json':
      return canonicalMigrationJson(value);
    case 'text-array':
    case 'uuid-array': {
      const canonical = canonicalMigrationJson(value);
      const items: unknown = JSON.parse(canonical);
      if (!Array.isArray(items) || items.some((item) => item !== null && typeof item !== 'string'))
        fail('INVALID_ARRAY');
      if (column.kind === 'text-array') return canonical;
      return JSON.stringify(
        items.map((item: string | null) => {
          if (item === null) return null;
          if (!uuid.test(item)) fail('INVALID_UUID');
          return item.toLowerCase();
        }),
      );
    }
    default:
      return fail('INVALID_KIND');
  }
}

function validateTable(table: MigrationTable) {
  if (!table.name || !table.columns.length || !table.primaryKey.length) fail('INVALID_TABLE');
  const names = new Set<string>();
  for (const column of table.columns) {
    if (!column.name || names.has(column.name) || !kinds.has(column.kind) || typeof column.nullable !== 'boolean')
      fail('INVALID_TABLE');
    names.add(column.name);
  }
  if (
    new Set(table.primaryKey).size !== table.primaryKey.length ||
    table.primaryKey.some((name) => !table.columns.some((column) => column.name === name && !column.nullable))
  )
    fail('INVALID_TABLE');
}

/** PostgreSQL export の生文字列を、D1 の TEXT/INTEGER/NULL 用の行へ変換する。接続・SQL実行は行わない。 */
export function encodeMigrationRow(table: MigrationTable, row: unknown, source: Source = 'postgres'): MigrationRow {
  validateTable(table);
  if (
    !record(row) ||
    Object.keys(row).length !== table.columns.length ||
    table.columns.some((column) => !Object.hasOwn(row, column.name))
  )
    fail('COLUMN_MISMATCH');
  return Object.fromEntries(table.columns.map((column) => [column.name, cell(column, row[column.name], source)]));
}

function normalizedTable(table: MigrationTable, rows: readonly unknown[], source: Source) {
  validateTable(table);
  const byKey = new Map<string, string>();
  for (const raw of rows) {
    const row = encodeMigrationRow(table, raw, source);
    const key = JSON.stringify(table.primaryKey.map((name) => row[name]));
    if (byKey.has(key)) fail('DUPLICATE_PRIMARY_KEY');
    byKey.set(key, JSON.stringify(table.columns.map((column) => row[column.name])));
  }
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ format: 'd1-migration-v1', table }));
  for (const [key, row] of [...byKey].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    // JSON配列を行境界に使い、列値の区切り文字との衝突を避ける。
    hash.update(JSON.stringify([key, row]));
  }
  return { byKey, checksum: hash.digest('hex') };
}

/** 同じ台帳の表について、件数・厳密なPK集合・型正規化後の全行を照合する。返すのは集計だけ。 */
export function compareMigrationTable(table: MigrationTable, postgres: readonly unknown[], d1: readonly unknown[]) {
  const before = normalizedTable(table, postgres, 'postgres');
  const after = normalizedTable(table, d1, 'd1');
  let missing = 0,
    unexpected = 0,
    changed = 0;
  for (const [key, row] of before.byKey) {
    if (!after.byKey.has(key)) missing++;
    else if (after.byKey.get(key) !== row) changed++;
  }
  for (const key of after.byKey.keys()) if (!before.byKey.has(key)) unexpected++;
  return {
    matches: missing === 0 && unexpected === 0 && changed === 0,
    sourceCount: before.byKey.size,
    targetCount: after.byKey.size,
    missingCount: missing,
    unexpectedCount: unexpected,
    changedCount: changed,
    sourceChecksum: before.checksum,
    targetChecksum: after.checksum,
  };
}
