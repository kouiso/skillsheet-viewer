import { type BlockInput, isBlockInput } from '@skillsheet/db';
import { z } from 'zod';

// packages/db は zod を入れない方針（doc/03-github-api.md）のため、ブロックの検証は
// 既存の isBlockInput（判別ユニオンの型ガード）を唯一の正本として z.custom で再利用する。
// zod 側でユニオンをミラーすると二重管理になり必ずドリフトするため、ここでは張らない。
const blockInputSchema = z.custom<BlockInput>(isBlockInput, { message: 'invalid block input' });
const sheetIdSchema = z.uuid();

// id は DB の uuid 列（packages/db/src/schema.ts）に対応する。形式が UUID でない値を
// そのまま Drizzle/Postgres へ渡すと SQLSTATE 22P02（invalid input syntax for type uuid）が
// throw され、is-config-error.ts の判定対象にも入っていないため 500 まで抜けてしまう
// （Issue #196）。ここで BAD_REQUEST として弾き、DB の SQLSTATE 22P02 / 500 を防ぐ。
export const sheetIdInputSchema = z.object({ id: sheetIdSchema });

export const saveSheetInputSchema = z.object({
  title: z.string(),
  blocks: z.array(blockInputSchema),
  sheetId: sheetIdSchema.optional(),
  // Server Actions のシリアライズ境界と同様、tRPC の HTTP 経路でも Date が
  // シリアライズを跨ぐ可能性があるため superjson 前提でも Date のまま受ける。
  expectedUpdatedAt: z.date().optional(),
});

export const createSheetInputSchema = z.object({
  title: z.string(),
  templateId: z.string().optional(),
});

export const deleteSheetInputSchema = z.object({ sheetId: sheetIdSchema });

export const githubSheetPathInputSchema = z.object({ path: z.string() });

export const builderStateInputSchema = z.object({ sheetId: z.string().optional() });

export const viewerLoginInputSchema = z.object({ code: z.string() });
