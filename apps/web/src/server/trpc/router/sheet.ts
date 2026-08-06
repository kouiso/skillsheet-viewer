import { ConflictError, createSheet, deleteSheet, SkillSheetNotFoundError, saveSkillSheetBlocks } from '@skillsheet/db';
import { TRPCError } from '@trpc/server';
import { revalidateTag } from 'next/cache';

import { getCachedDbSheet, getCachedDbSheetById, getCachedDbSheets } from '@/server/sheets-cache';

import { getTemplate } from '../../../../app/builder/templates';
import { editorProcedure, router, viewerProcedure } from '../init';
import { createSheetInputSchema, deleteSheetInputSchema, saveSheetInputSchema, sheetIdInputSchema } from '../schema';

// Route Handler は Server Action ではないため next/cache の updateTag は使えない
// （Next.js 16 公式: "It cannot be used in Route Handlers"）。tRPC mutation は必ず
// Route Handler 経由で実行されるため、代わりに revalidateTag(tag, { expire: 0 }) で
// 即時失効させる。同じ問題を app/api/revalidate/route.ts が既に解決しており、
// { expire: 0 } を指定しないと即時失効が保証されない（本番で無効化されない不具合実績あり）。
function invalidateDbSheetCache(): void {
  revalidateTag('db-sheet', { expire: 0 });
}

export const sheetRouter = router({
  list: viewerProcedure.query(() => getCachedDbSheets()),

  // tRPC procedure は throw された値を無条件で TRPCError にラップする（server caller 経由でも
  // 同様）ため、SkillSheetNotFoundError の instanceof チェックを呼び出し元に残す設計は使えない。
  // NOT_FOUND コードへ明示的にマップし、呼び出し元は TRPCError の code で判定する。
  byId: viewerProcedure.input(sheetIdInputSchema).query(async ({ input }) => {
    try {
      return await getCachedDbSheetById(input.id);
    } catch (err) {
      if (err instanceof SkillSheetNotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      }
      throw err;
    }
  }),

  getDefault: viewerProcedure.query(() => getCachedDbSheet()),

  save: editorProcedure.input(saveSheetInputSchema).mutation(async ({ input }) => {
    try {
      const result = await saveSkillSheetBlocks(input.title, input.blocks, input.sheetId, input.expectedUpdatedAt);
      invalidateDbSheetCache();
      return result;
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: 'CONFLICT', message: err.message });
      }
      throw err;
    }
  }),

  create: editorProcedure.input(createSheetInputSchema).mutation(async ({ input }) => {
    const initialBlocks = input.templateId ? getTemplate(input.templateId)?.blocks : undefined;
    const sheetId = await createSheet(input.title, initialBlocks);
    invalidateDbSheetCache();
    return { sheetId };
  }),

  delete: editorProcedure.input(deleteSheetInputSchema).mutation(async ({ input }) => {
    await deleteSheet(input.sheetId);
    invalidateDbSheetCache();
    return { ok: true as const };
  }),
});
