import { encodeMigrationRow } from '../d1-migration-codec';
import type { MigrationEstateInventory, MigrationEstatePlan, SyntheticEstateCopy } from '../d1-migration-estate';

/** 架空の10branch。main以外の実DB一覧を推測せず、DB数もbranchごとに変えた合成データ。 */
export function syntheticMigrationEstate() {
  const inventory: MigrationEstateInventory = {
    evidence: 'synthetic',
    project: 'fixture-project',
    enumeration: 'complete',
    expectedBranchCount: 10,
    production: { branch: 'fixture-main', database: 'neondb' },
    branches: [],
  };
  const plans: MigrationEstatePlan[] = [];
  const copies: SyntheticEstateCopy[] = [];
  for (let index = 0; index < 10; index++) {
    const id = index === 0 ? 'fixture-main' : index === 1 ? 'fixture-validation' : `fixture-archive-${index}`;
    const databaseNames =
      index === 0
        ? ['neondb', 'devin_repro_e2e', 'skillsheet_e2e']
        : index % 2 === 0
          ? ['neondb']
          : ['neondb', 'skillsheet_e2e'];
    const branch: MigrationEstateInventory['branches'][number] = {
      id,
      role: index === 0 ? 'main' : index === 1 ? 'validation' : 'archive',
      enumeration: 'complete',
      expectedDatabaseCount: databaseNames.length,
      databases: [],
    };
    for (const databaseName of databaseNames) {
      const origin = {
        project: inventory.project,
        branch: id,
        database: databaseName,
        snapshot: `fixture-snapshot-${index}`,
      };
      const production = index === 0 && databaseName === 'neondb';
      const names = ['public.document', 'skillsheet_private.principals', 'drizzle.__drizzle_migrations'];
      if (databaseName !== 'neondb') names.push('public.document_versions', 'public.deleted_documents');
      if (databaseName === 'skillsheet_e2e') names.push('public.drive_destination');
      const database: MigrationEstateInventory['branches'][number]['databases'][number] = {
        name: databaseName,
        snapshot: origin.snapshot,
        enumeration: 'complete',
        expectedTableCount: names.length,
        tables: names.map((name) => ({
          expectedColumnCount: 2,
          table: {
            name,
            columns: [
              { name: 'id', kind: 'text', nullable: false },
              { name: 'value', kind: 'text', nullable: false },
            ],
            primaryKey: ['id'],
          },
          classifications: [
            { column: 'id', handling: 'ordinary' },
            { column: 'value', handling: 'ordinary' },
          ],
        })),
      };
      branch.databases.push(database);
      const plan: MigrationEstatePlan = {
        ledger: {
          origin,
          tables: database.tables.map(({ table }) => ({
            table: structuredClone(table),
            state: 'present',
            disposition: production && table.name !== 'drizzle.__drizzle_migrations' ? 'migrate' : 'preserve',
          })),
        },
        d1Namespace: production ? 'fixture-shared-d1-for-both-frontends' : null,
        preservationNamespace: JSON.stringify(['fixture-archive', id, databaseName]),
      };
      const copy: SyntheticEstateCopy = {
        source: { origin: { ...origin }, tables: [] },
        migrated: { origin: { ...origin }, tables: [] },
        preserved: { origin: { ...origin }, tables: [] },
      };
      for (const entry of plan.ledger.tables) {
        // 全DBで同じPKを使い、別DB/branchとの入替を値照合でも検出する。
        const rows = [{ id: 'same-primary-key', value: JSON.stringify([id, databaseName, entry.table.name]) }];
        copy.source.tables.push({ name: entry.table.name, state: 'present', rows: structuredClone(rows) });
        const destination = entry.disposition === 'migrate' ? copy.migrated : copy.preserved;
        destination.tables.push({
          name: entry.table.name,
          state: 'present',
          rows:
            entry.disposition === 'migrate'
              ? rows.map((row) => encodeMigrationRow(entry.table, row))
              : structuredClone(rows),
        });
      }
      plans.push(plan);
      copies.push(copy);
    }
    inventory.branches.push(branch);
  }
  return { inventory, plans, copies };
}
