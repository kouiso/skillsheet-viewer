import { z } from 'zod';
import { isRevision } from '@/db/document-contract';

const sheetIdSchema = z.uuid();

// id は DB の uuid 列（src/db/schema.ts）に対応する。形式が UUID でない値を
// そのまま Drizzle/Postgres へ渡すと SQLSTATE 22P02（invalid input syntax for type uuid）が
// throw され、is-config-error.ts の判定対象にも入っていないため 500 まで抜けてしまう
// （Issue #196）。ここで BAD_REQUEST として弾き、DB の SQLSTATE 22P02 / 500 を防ぐ。
export const sheetIdInputSchema = z.object({ id: sheetIdSchema });

const documentBlockSchema = z
  .object({
    id: sheetIdSchema,
    type: z.string(),
    order: z.number().int().nonnegative(),
    data: z.unknown(),
  })
  .strict();
const revisionSchema = z.string().refine(isRevision, 'invalid revision');
export const saveSheetInputSchema = z.object({
  title: z.string(),
  blocks: z.array(documentBlockSchema),
  sheetId: sheetIdSchema,
  expectedRevision: revisionSchema,
});
export const createSheetInputSchema = z.object({
  title: z.string(),
  sheetId: sheetIdSchema,
  blocks: z.array(documentBlockSchema),
});
export const deleteSheetInputSchema = z.object({ sheetId: sheetIdSchema, expectedRevision: revisionSchema });

export const githubSheetPathInputSchema = z.object({ path: z.string() });

export const builderStateInputSchema = z.object({ sheetId: sheetIdSchema.optional() });

export const viewerLoginInputSchema = z.object({ code: z.string() });
