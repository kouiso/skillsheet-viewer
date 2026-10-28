import { describe, expect, it } from 'vitest';
import {
  compareSyntheticMigrationEstate,
  type MigrationEstateInventory,
  migrationReviewColumns,
  migrationSecretColumns,
  validateMigrationEstate,
} from './d1-migration-estate';
import { syntheticMigrationEstate } from './fixture/d1-migration-estate';

function metadata(input = syntheticMigrationEstate()) {
  return validateMigrationEstate(input.inventory, input.plans);
}
function compare(input = syntheticMigrationEstate()) {
  return compareSyntheticMigrationEstate(input.inventory, input.plans, input.copies);
}
function classified(name: string, column: string, handling: 'ordinary' | 'secret' | 'review-required') {
  const input = syntheticMigrationEstate();
  const entry: MigrationEstateInventory['branches'][number]['databases'][number]['tables'][number] = {
    expectedColumnCount: 1,
    table: {
      name,
      columns: [{ name: column, kind: 'text', nullable: false }],
      primaryKey: [column],
    },
    classifications: [{ column, handling }],
  };
  // 秘密列は列名・型の検査だけ。秘密の実値や合成tokenもこのfixtureには作らない。
  const database = input.inventory.branches[0].databases[0];
  database.tables.push(entry);
  database.expectedTableCount++;
  input.plans[0].ledger.tables.push({ table: structuredClone(entry.table), state: 'present', disposition: 'preserve' });
  return input;
}

describe('プロジェクト全体のbranch/DB/表/秘密分類のオフライン契約', () => {
  it('10branch・3種類のDB名を個別照合し、E2E/archivedをD1へ混ぜない', () => {
    const input = syntheticMigrationEstate();
    const before = structuredClone(input);
    expect(input.inventory.branches.filter((entry) => entry.role === 'archive')).toHaveLength(8);
    expect(input.inventory.branches[0].databases.map((entry) => entry.name)).toEqual([
      'neondb',
      'devin_repro_e2e',
      'skillsheet_e2e',
    ]);
    const report = compare(input);
    expect(report).toMatchObject({
      evidence: 'synthetic',
      matches: true,
      branchCount: 10,
      databaseCount: 17,
      transferGate: 'closed',
    });
    expect(report.comparisons).toHaveLength(17);
    expect(input.plans.filter((plan) => plan.d1Namespace !== null)).toHaveLength(1);
    expect(report.inventoryChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(input).toEqual(before);
  });

  it('mainの3DBは表集合が異なり、private schemaと旧移行台帳も個別に保持する', () => {
    const input = syntheticMigrationEstate();
    const tables = input.inventory.branches[0].databases.map((database) =>
      database.tables.map(({ table }) => table.name),
    );
    expect(tables[0]).not.toContain('public.document_versions');
    expect(tables[1]).toContain('public.document_versions');
    expect(tables[1]).not.toContain('public.drive_destination');
    expect(tables[2]).toContain('public.drive_destination');
    for (const names of tables) {
      expect(names).toContain('skillsheet_private.principals');
      expect(names).toContain('drizzle.__drizzle_migrations');
    }
    input.plans[0].ledger.tables.push(structuredClone(input.plans[1].ledger.tables[3]));
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_SET_MISMATCH');
  });

  it('表が0件と棚卸し済みのDBも、DB自体を落とさず別来歴で保全する', () => {
    const input = syntheticMigrationEstate();
    const database = input.inventory.branches[2].databases[0];
    database.tables = [];
    database.expectedTableCount = 0;
    const index = input.plans.findIndex((plan) => plan.ledger.origin.branch === input.inventory.branches[2].id);
    input.plans[index].ledger.tables = [];
    input.copies[index].source.tables = [];
    input.copies[index].preserved.tables = [];
    expect(compare(input)).toMatchObject({ matches: true, databaseCount: 17, transferGate: 'closed' });
    input.plans.splice(index, 1);
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_SET_MISMATCH');
  });

  it('同じ件数のbranch/DB/表でも重複した識別子で埋め合わせできない', () => {
    for (const level of ['branch', 'database', 'table'] as const) {
      const input = syntheticMigrationEstate();
      if (level === 'branch') input.inventory.branches[2].id = input.inventory.branches[1].id;
      if (level === 'database') input.inventory.branches[0].databases[1].name = 'neondb';
      if (level === 'table') {
        input.inventory.branches[0].databases[0].tables[1].table.name = 'public.document';
      }
      expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_DUPLICATE_IDENTITY');
    }
  });

  it.each(['branch', 'database', 'table'] as const)('%sの未確定列挙を件数だけで完了にしない', (level) => {
    const input = syntheticMigrationEstate();
    if (level === 'branch') input.inventory.enumeration = 'incomplete';
    if (level === 'database') input.inventory.branches[0].enumeration = 'incomplete';
    if (level === 'table') input.inventory.branches[0].databases[0].enumeration = 'incomplete';
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_INCOMPLETE_INVENTORY');
  });
  it.each(['branch', 'database', 'table'] as const)('%sを台帳と計画の両方から落としても観測件数と照合する', (level) => {
    const input = syntheticMigrationEstate();
    if (level === 'branch') {
      const removed = input.inventory.branches.pop();
      input.plans = input.plans.filter((plan) => plan.ledger.origin.branch !== removed?.id);
    }
    if (level === 'database') {
      input.inventory.branches[0].databases.pop();
      input.plans.splice(2, 1);
    }
    if (level === 'table') {
      input.inventory.branches[0].databases[0].tables.pop();
      input.plans[0].ledger.tables.pop();
    }
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_COUNT_MISMATCH');
  });
  it('件数が同じでも未列挙DBへの入替と別projectの計画を拒否する', () => {
    const input = syntheticMigrationEstate();
    input.plans[2].ledger.origin.database = 'adult-ai-db';
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_SET_MISMATCH');
    input.plans[2].ledger.origin.database = 'skillsheet_e2e';
    input.plans[2].ledger.origin.project = 'unrelated-project';
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_SET_MISMATCH');
  });
  it('同名DB/表/PKでも別branchへの来歴差替を拒否する', () => {
    const input = syntheticMigrationEstate();
    input.copies[0].migrated.origin.branch = input.inventory.branches[2].id;
    expect(() => compare(input)).toThrow('MIGRATION_ESTATE_INVALID_DATA');
  });
  it('来歴を偽装して別DB/branchの同じPKの値だけを混ぜても不一致になる', () => {
    const input = syntheticMigrationEstate();
    input.copies[0].migrated.tables[0] = structuredClone(input.copies[3].preserved.tables[0]);
    expect(compare(input).matches).toBe(false);
  });
  it('DBの計画・保全コピーの欠落や重複を拒否する', () => {
    const input = syntheticMigrationEstate();
    input.copies.pop();
    expect(() => compare(input)).toThrow('MIGRATION_ESTATE_SET_MISMATCH');
    input.copies.push(structuredClone(input.copies[0]));
    expect(() => compare(input)).toThrow('MIGRATION_ESTATE_DUPLICATE_IDENTITY');
  });
  it('空の保全コピーでarchivedの保存完了とはしない', () => {
    const input = syntheticMigrationEstate();
    input.copies[3].preserved.tables = [];
    expect(() => compare(input)).toThrow('MIGRATION_ESTATE_INVALID_DATA');
  });
  it('本番以外のD1配置・migrate指定・成果物namespace共有を拒否する', () => {
    const input = syntheticMigrationEstate();
    input.plans[1].d1Namespace = 'fixture-second-d1';
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_DESTINATION_SCOPE_MISMATCH');
    input.plans[1].d1Namespace = null;
    input.plans[1].ledger.tables[0].disposition = 'migrate';
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_NON_PRODUCTION_MIGRATION');
    input.plans[1].ledger.tables[0].disposition = 'preserve';
    input.plans[1].preservationNamespace = input.plans[0].preservationNamespace;
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_DUPLICATE_IDENTITY');
  });
  it('本番D1の論理配置先欠落を拒否し、実際のD1存在確認へ昇格しない', () => {
    const input = syntheticMigrationEstate();
    input.plans[0].d1Namespace = null;
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_DESTINATION_SCOPE_MISMATCH');
  });
  it('列の欠落・追加・型差替・未導入表への変更を拒否する', () => {
    for (const mutation of ['missing', 'extra', 'kind', 'presence'] as const) {
      const input = syntheticMigrationEstate();
      const entry = input.plans[0].ledger.tables[0];
      if (mutation === 'missing') entry.table.columns.pop();
      if (mutation === 'extra') entry.table.columns.push({ name: 'unreviewed', kind: 'text', nullable: true });
      if (mutation === 'kind') entry.table.columns[0].kind = 'json';
      if (mutation === 'presence') entry.state = 'not-installed';
      expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_TABLE_CONTRACT_MISMATCH');
    }
  });
  for (const [table, columns] of Object.entries(migrationSecretColumns)) {
    it.each(columns)(`${table}.%sの秘密分類を省略・格下げできない`, (column) => {
      const input = classified(table, column, 'secret');
      expect(metadata(input)).toMatchObject({ secretColumnCount: 1, transferGate: 'closed' });
      const definitions = input.inventory.branches[0].databases[0].tables.at(-1)?.classifications;
      if (!definitions) throw new Error('INVALID_FIXTURE');
      definitions[0].handling = 'review-required';
      expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_SECRET_DOWNGRADE');
      definitions.pop();
      expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_SET_MISMATCH');
    });
  }
  for (const [table, columns] of Object.entries(migrationReviewColumns)) {
    it.each(columns)(`${table}.%sは秘密なしと自動確定しない`, (column) => {
      const input = classified(table, column, 'review-required');
      expect(metadata(input)).toMatchObject({ reviewColumnCount: 1, transferGate: 'closed' });
      const definitions = input.inventory.branches[0].databases[0].tables.at(-1)?.classifications;
      if (!definitions) throw new Error('INVALID_FIXTURE');
      definitions[0].handling = 'ordinary';
      expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_REVIEW_DOWNGRADE');
    });
  }
  it('新規列を追加した棚卸しには分類が必須', () => {
    const input = syntheticMigrationEstate();
    input.inventory.branches[0].databases[0].tables[0].table.columns.push({
      name: 'unknown',
      kind: 'text',
      nullable: true,
    });
    input.inventory.branches[0].databases[0].tables[0].expectedColumnCount++;
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_SET_MISMATCH');
  });

  it('棚卸しと計画から同じ列を落としても、独立した観測列数と一致しなければ拒否する', () => {
    const input = syntheticMigrationEstate();
    const entry = input.inventory.branches[0].databases[0].tables[0];
    entry.table.columns.pop();
    entry.classifications.pop();
    input.plans[0].ledger.tables[0].table.columns.pop();
    expect(() => metadata(input)).toThrow('MIGRATION_ESTATE_COUNT_MISMATCH');
  });
  it('実メタデータは計画照合のみで、行照合の合成fixture入口へ通さない', () => {
    const input = syntheticMigrationEstate();
    input.inventory.evidence = 'metadata-observation';
    expect(metadata(input)).toMatchObject({ evidence: 'metadata-observation', transferGate: 'closed' });
    expect(() => compare(input)).toThrow('MIGRATION_ESTATE_SYNTHETIC_ONLY');
  });
  it('承認入力や行値をメタデータ契約へ混入できず、診断も値を漏らさない', () => {
    const input = syntheticMigrationEstate();
    const marker = 'fixture-must-not-appear-in-diagnostics';
    for (const extra of [{ approval: 'approved' }, { rows: [{ secret: marker }] }]) {
      expect(() => validateMigrationEstate({ ...input.inventory, ...extra }, input.plans)).toThrow(
        'MIGRATION_ESTATE_INVALID_INPUT',
      );
      expect(() => validateMigrationEstate({ ...input.inventory, ...extra }, input.plans)).not.toThrow(marker);
    }
    expect(JSON.stringify(metadata(input))).not.toContain('fixture-project');
  });
});
