import { createHash } from 'node:crypto';
import { z } from 'zod';
import { compareMigrationTable } from './d1-migration-codec';
import { canonicalMigrationJson } from './d1-migration-json';
import {
  compareMigrationSnapshot,
  type MigrationSnapshot,
  migrationLedgerSchema,
  migrationTableSchema,
} from './d1-migration-snapshot';

const name = z.string().min(1);
const enumeration = z.enum(['complete', 'incomplete']);
const handling = z.enum(['ordinary', 'secret', 'review-required']);
const inventorySchema = z.strictObject({
  evidence: z.enum(['synthetic', 'metadata-observation']),
  project: name,
  enumeration,
  expectedBranchCount: z.number().int().positive(),
  production: z.strictObject({ branch: name, database: name }),
  branches: z.array(
    z.strictObject({
      id: name,
      role: z.enum(['main', 'validation', 'archive']),
      enumeration,
      expectedDatabaseCount: z.number().int().nonnegative(),
      databases: z.array(
        z.strictObject({
          name,
          snapshot: name,
          enumeration,
          expectedTableCount: z.number().int().nonnegative(),
          tables: z.array(
            z.strictObject({
              table: migrationTableSchema,
              expectedColumnCount: z.number().int().positive(),
              classifications: z.array(z.strictObject({ column: name, handling })),
            }),
          ),
        }),
      ),
    }),
  ),
});
const plansSchema = z.array(
  z.strictObject({
    ledger: migrationLedgerSchema,
    // 物理的なDB IDや接続設定ではなく、原本ごとに分離する成果物の論理識別子。
    d1Namespace: name.nullable(),
    preservationNamespace: name,
  }),
);
export type MigrationEstateInventory = z.infer<typeof inventorySchema>;
export type MigrationEstatePlan = z.infer<typeof plansSchema>[number];
export interface SyntheticEstateCopy {
  source: MigrationSnapshot;
  migrated: MigrationSnapshot;
  preserved: MigrationSnapshot;
}

// hash・暗号文も秘密扱い。新しい列は棚卸し側で明示分類するまで通らない。
export const migrationSecretColumns: Readonly<Record<string, readonly string[]>> = {
  'public.session': ['token'],
  'public.account': ['access_token', 'refresh_token', 'id_token', 'password'],
  'public.verification': ['value', 'identifier'],
  'public.jwks': ['private_key'],
  'public.oauth_client': ['client_secret'],
  'public.oauth_refresh_token': ['token', 'rotation_replay_response'],
  'public.oauth_access_token': ['token'],
};
export const migrationReviewColumns: Readonly<Record<string, readonly string[]>> = {
  'public.oauth_client': ['jwks', 'software_statement', 'metadata'],
  'public.oauth_resource': ['custom_claims', 'metadata'],
  'public.oauth_client_resource': ['metadata'],
  'public.oauth_refresh_token': ['confirmation', 'authorization_code_id'],
  'public.oauth_access_token': ['confirmation', 'authorization_code_id'],
  'public.oauth_client_assertion': ['id'],
};

class EstateError extends Error {}
function fail(code: string): never {
  throw new EstateError(`MIGRATION_ESTATE_${code}`);
}
function guarded<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof EstateError) throw error;
    // Zodや下位codecの例外にも入力・行・来歴を載せない。
    return fail('INVALID_DATA');
  }
}
function distinct(values: string[]) {
  if (new Set(values).size !== values.length) fail('DUPLICATE_IDENTITY');
}
function sameSet(expected: string[], actual: string[]) {
  distinct(expected);
  distinct(actual);
  if (expected.length !== actual.length || expected.some((value) => !actual.includes(value))) fail('SET_MISMATCH');
}
function originKey(origin: { project: string; branch: string; database: string; snapshot: string }) {
  // 区切り文字を含む識別子同士も連結衝突させない。
  return JSON.stringify([origin.project, origin.branch, origin.database, origin.snapshot]);
}
function canonical(value: unknown) {
  return canonicalMigrationJson(JSON.stringify(value));
}

/** メタデータだけで全branch/DB/表/列の計画を検査する。外部棚卸しの真実性や保存先の存在は証明しない。 */
export function validateMigrationEstate(inventoryInput: unknown, plansInput: unknown) {
  return guarded(() => validate(inventoryInput, plansInput).report);
}

function validate(inventoryInput: unknown, plansInput: unknown) {
  const inventoryResult = inventorySchema.safeParse(inventoryInput);
  const plansResult = plansSchema.safeParse(plansInput);
  if (!inventoryResult.success || !plansResult.success) return fail('INVALID_INPUT');
  const inventory = inventoryResult.data;
  const plans = plansResult.data;
  if (inventory.enumeration !== 'complete') fail('INCOMPLETE_INVENTORY');
  if (inventory.branches.length !== inventory.expectedBranchCount) fail('COUNT_MISMATCH');
  distinct(inventory.branches.map((branch) => branch.id));
  const mains = inventory.branches.filter((branch) => branch.role === 'main');
  if (mains.length !== 1 || mains[0].id !== inventory.production.branch) fail('PRODUCTION_SCOPE_MISMATCH');
  const expected = new Map<string, { database: (typeof mains)[number]['databases'][number]; production: boolean }>();
  let tableCount = 0;
  let secretColumnCount = 0;
  let reviewColumnCount = 0;
  for (const branch of inventory.branches) {
    if (branch.enumeration !== 'complete') fail('INCOMPLETE_INVENTORY');
    if (branch.databases.length !== branch.expectedDatabaseCount) fail('COUNT_MISMATCH');
    distinct(branch.databases.map((database) => database.name));
    for (const database of branch.databases) {
      if (database.enumeration !== 'complete') fail('INCOMPLETE_INVENTORY');
      if (database.tables.length !== database.expectedTableCount) fail('COUNT_MISMATCH');
      distinct(database.tables.map((entry) => entry.table.name));
      for (const { table, expectedColumnCount, classifications } of database.tables) {
        compareMigrationTable(table, [], []);
        if (table.columns.length !== expectedColumnCount) fail('COUNT_MISMATCH');
        sameSet(
          table.columns.map((column) => column.name),
          classifications.map((entry) => entry.column),
        );
        for (const classification of classifications) {
          const requiredSecret = migrationSecretColumns[table.name]?.includes(classification.column);
          const requiredReview = migrationReviewColumns[table.name]?.includes(classification.column);
          if (requiredSecret && classification.handling !== 'secret') fail('SECRET_DOWNGRADE');
          if (requiredReview && classification.handling === 'ordinary') fail('REVIEW_DOWNGRADE');
          if (classification.handling === 'secret') secretColumnCount++;
          if (classification.handling === 'review-required') reviewColumnCount++;
        }
        tableCount++;
      }
      const origin = {
        project: inventory.project,
        branch: branch.id,
        database: database.name,
        snapshot: database.snapshot,
      };
      expected.set(originKey(origin), {
        database,
        production: branch.id === inventory.production.branch && database.name === inventory.production.database,
      });
    }
  }
  if (![...expected.values()].some((entry) => entry.production)) fail('PRODUCTION_SCOPE_MISMATCH');
  sameSet(
    [...expected.keys()],
    plans.map((plan) => originKey(plan.ledger.origin)),
  );
  distinct(
    plans.flatMap((plan) => [plan.preservationNamespace, ...(plan.d1Namespace === null ? [] : [plan.d1Namespace])]),
  );
  for (const plan of plans) {
    const entry = expected.get(originKey(plan.ledger.origin));
    if (!entry) return fail('SET_MISMATCH');
    if (entry.production !== (plan.d1Namespace !== null)) fail('DESTINATION_SCOPE_MISMATCH');
    sameSet(
      entry.database.tables.map(({ table }) => table.name),
      plan.ledger.tables.map(({ table }) => table.name),
    );
    for (const planned of plan.ledger.tables) {
      const inventoried = entry.database.tables.find(({ table }) => table.name === planned.table.name);
      if (!inventoried || canonical(inventoried.table) !== canonical(planned.table)) fail('TABLE_CONTRACT_MISMATCH');
      // inventoryは存在する表の一覧。未導入候補の補完や他DBの表を借りる指定は認めない。
      if (planned.state !== 'present') fail('TABLE_CONTRACT_MISMATCH');
      if (!entry.production && planned.disposition !== 'preserve') fail('NON_PRODUCTION_MIGRATION');
    }
  }
  const report = {
    evidence: inventory.evidence,
    branchCount: inventory.branches.length,
    databaseCount: expected.size,
    tableCount,
    secretColumnCount,
    reviewColumnCount,
    // 計画の整合や合成データの一致を、実移送・秘密移送・継続認証の承認へ昇格させない。
    transferGate: 'closed' as const,
    inventoryChecksum: createHash('sha256').update(canonical(inventory)).digest('hex'),
    planChecksum: createHash('sha256').update(canonical(plans)).digest('hex'),
  };
  return { inventory, plans, report };
}

/** 合成fixture専用。実値を扱うexporter/importerへの入口にはしない。 */
export function compareSyntheticMigrationEstate(
  inventoryInput: unknown,
  plansInput: unknown,
  copies: SyntheticEstateCopy[],
) {
  return guarded(() => {
    const { inventory, plans, report } = validate(inventoryInput, plansInput);
    if (inventory.evidence !== 'synthetic') fail('SYNTHETIC_ONLY');
    sameSet(
      plans.map((plan) => originKey(plan.ledger.origin)),
      copies.map((copy) => originKey(copy.source.origin)),
    );
    const comparisons = plans.map((plan) => {
      const copy = copies.find((candidate) => originKey(candidate.source.origin) === originKey(plan.ledger.origin));
      if (!copy) return fail('SET_MISMATCH');
      return compareMigrationSnapshot(plan.ledger, copy.source, copy.migrated, copy.preserved);
    });
    return { ...report, matches: comparisons.every((comparison) => comparison.matches), comparisons };
  });
}
