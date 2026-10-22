import { createHash } from 'node:crypto';
import { z } from 'zod';
import { compareMigrationTable, encodeMigrationRow, type MigrationTable } from './d1-migration-codec';
import { canonicalMigrationJson } from './d1-migration-json';

const originSchema = z.strictObject({
  project: z.string().min(1),
  database: z.string().min(1),
  branch: z.string().min(1),
  snapshot: z.string().min(1),
});
// SQL は生成しない。引用や曖昧な複数ドットを含む識別子は、別の明示契約ができるまで拒否する。
const tableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]*\.[A-Za-z_][A-Za-z0-9_$]*$/);
const tableSchema = z.strictObject({
  name: tableName,
  columns: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        kind: z.enum([
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
        ]),
        nullable: z.boolean(),
      }),
    )
    .min(1),
  primaryKey: z.array(z.string().min(1)).min(1),
});
const ledgerSchema = z.strictObject({
  origin: originSchema,
  tables: z
    .array(
      z.strictObject({
        table: tableSchema,
        disposition: z.enum(['migrate', 'preserve']),
        state: z.enum(['present', 'not-installed']),
      }),
    )
    .min(1),
});
const snapshotTableSchema = z.discriminatedUnion('state', [
  z.strictObject({ name: tableName, state: z.literal('present'), rows: z.array(z.unknown()) }),
  z.strictObject({ name: tableName, state: z.literal('not-installed') }),
]);
const snapshotSchema = z.strictObject({
  origin: originSchema,
  tables: z.array(snapshotTableSchema),
});

export type MigrationOrigin = z.infer<typeof originSchema>;
type LedgerEntry = z.infer<typeof ledgerSchema>['tables'][number];
export interface MigrationLedger {
  origin: MigrationOrigin;
  tables: (Omit<LedgerEntry, 'table'> & { table: MigrationTable })[];
}
export type MigrationSnapshot = z.infer<typeof snapshotSchema>;
type SnapshotTable = MigrationSnapshot['tables'][number];

class SnapshotError extends Error {}
function fail(code: string): never {
  // 表・行・PK・来歴にも機微情報が入るため、エラーには入力や ZodError を含めない。
  throw new SnapshotError(`MIGRATION_SNAPSHOT_${code}`);
}
function sameOrigin(left: MigrationOrigin, right: MigrationOrigin) {
  return (
    left.project === right.project &&
    left.database === right.database &&
    left.branch === right.branch &&
    left.snapshot === right.snapshot
  );
}
function indexTables(tables: readonly SnapshotTable[]) {
  const index = new Map<string, SnapshotTable>();
  for (const table of tables) {
    if (index.has(table.name)) fail('DUPLICATE_TABLE');
    index.set(table.name, table);
  }
  return index;
}
function requireTableSet(expected: readonly string[], actual: Map<string, SnapshotTable>) {
  if (expected.length !== actual.size || expected.some((name) => !actual.has(name))) fail('TABLE_SET_MISMATCH');
}

/**
 * 同じ移行元 snapshot の台帳・原本・D1 用コピー・分離保全コピーを照合する。
 * origin はコピーの物理的な保存先ではなく原本の来歴。別 branch は別の台帳で照合する。
 * preserve のコピーも全行必要で、除外の指定だけでは成功しない。空表も未導入表も一覧から省略しない。
 * 台帳自体が全データの棚卸しを網羅しているか、コピーが永続保存されたかは、この純粋関数では証明しない。
 */
export function compareMigrationSnapshot(
  ledgerInput: unknown,
  postgresInput: unknown,
  migratedInput: unknown,
  preservedInput: unknown,
) {
  try {
    return compare(ledgerInput, postgresInput, migratedInput, preservedInput);
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    // codec・入力オブジェクト等が投げた任意の例外を、そのまま診断へ渡さない。
    return fail('INVALID_DATA');
  }
}

function compare(ledgerInput: unknown, postgresInput: unknown, migratedInput: unknown, preservedInput: unknown) {
  const ledgerResult = ledgerSchema.safeParse(ledgerInput);
  const sourceResult = snapshotSchema.safeParse(postgresInput);
  const migratedResult = snapshotSchema.safeParse(migratedInput);
  const preservedResult = snapshotSchema.safeParse(preservedInput);
  if (!ledgerResult.success || !sourceResult.success || !migratedResult.success || !preservedResult.success)
    return fail('INVALID_INPUT');
  const ledger = ledgerResult.data;
  const source = sourceResult.data;
  const migrated = migratedResult.data;
  const preserved = preservedResult.data;
  if ([source, migrated, preserved].some((snapshot) => !sameOrigin(ledger.origin, snapshot.origin)))
    fail('ORIGIN_MISMATCH');
  const planned = new Set<string>();
  for (const entry of ledger.tables) {
    if (planned.has(entry.table.name)) fail('DUPLICATE_TABLE');
    planned.add(entry.table.name);
    // 未導入・空表でも、不正な列定義や主キーを含む台帳を通さない。
    compareMigrationTable(entry.table, [], []);
  }
  const sourceTables = indexTables(source.tables);
  const migratedTables = indexTables(migrated.tables);
  const preservedTables = indexTables(preserved.tables);
  requireTableSet([...planned], sourceTables);
  requireTableSet(
    ledger.tables.filter((entry) => entry.disposition === 'migrate').map((entry) => entry.table.name),
    migratedTables,
  );
  requireTableSet(
    ledger.tables.filter((entry) => entry.disposition === 'preserve').map((entry) => entry.table.name),
    preservedTables,
  );
  let notInstalledTableCount = 0;
  const comparisons = ledger.tables.map((entry) => {
    const original = sourceTables.get(entry.table.name);
    const copy = (entry.disposition === 'migrate' ? migratedTables : preservedTables).get(entry.table.name);
    if (!original || !copy) return fail('TABLE_SET_MISMATCH');
    if (entry.state !== original.state || entry.state !== copy.state) fail('PRESENCE_MISMATCH');
    if (original.state === 'not-installed' || copy.state === 'not-installed') {
      notInstalledTableCount++;
      return { disposition: entry.disposition, comparison: null };
    }
    // 保全コピーは Postgres export と同じ生形式。D1 用の型へ明示変換して既存の厳密照合へ渡す。
    const target =
      entry.disposition === 'preserve' ? copy.rows.map((row) => encodeMigrationRow(entry.table, row)) : copy.rows;
    return { disposition: entry.disposition, comparison: compareMigrationTable(entry.table, original.rows, target) };
  });
  const summarize = (disposition: 'migrate' | 'preserve') => {
    const selected = comparisons.filter((entry) => entry.disposition === disposition);
    return {
      tableCount: selected.length,
      sourceRowCount: selected.reduce((count, entry) => count + (entry.comparison?.sourceCount ?? 0), 0),
      targetRowCount: selected.reduce((count, entry) => count + (entry.comparison?.targetCount ?? 0), 0),
      missingRowCount: selected.reduce((count, entry) => count + (entry.comparison?.missingCount ?? 0), 0),
      unexpectedRowCount: selected.reduce((count, entry) => count + (entry.comparison?.unexpectedCount ?? 0), 0),
      changedRowCount: selected.reduce((count, entry) => count + (entry.comparison?.changedCount ?? 0), 0),
    };
  };
  // 行順・一覧順で指紋を変えず、台帳と origin の変更は必ず別の検証として識別する。
  const normalizedLedger = {
    ...ledger,
    tables: [...ledger.tables].sort((a, b) => (a.table.name < b.table.name ? -1 : a.table.name > b.table.name ? 1 : 0)),
  };
  const ledgerChecksum = createHash('sha256')
    .update(canonicalMigrationJson(JSON.stringify(normalizedLedger)))
    .digest('hex');
  return {
    matches: comparisons.every((entry) => entry.comparison?.matches ?? true),
    tableCount: ledger.tables.length,
    notInstalledTableCount,
    migrated: summarize('migrate'),
    preserved: summarize('preserve'),
    ledgerChecksum,
    // 名称・来歴・行・PKは返さず、台帳の順序に対応する集計だけを返す。
    tables: comparisons,
  };
}
