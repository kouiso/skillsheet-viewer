import { TRPCError } from '@trpc/server';
import { revalidateTag } from 'next/cache';
import { getDb, getOwnerId, SkillSheetNotFoundError } from '@/db';
import { createDocumentService, DocumentError } from '@/db/document-service';
import { getCachedDbSheet, getCachedDbSheetById, toStaleSheet } from '@/server/sheets-cache';

import { editorProcedure, router, viewerProcedure } from '../init';
import {
  builderStateInputSchema,
  createSheetInputSchema,
  deleteSheetInputSchema,
  saveSheetInputSchema,
  sheetIdInputSchema,
} from '../schema';

// Route Handler は Server Action ではないため next/cache の updateTag は使えない
// （Next.js 16 公式: "It cannot be used in Route Handlers"）。tRPC mutation は必ず
// Route Handler 経由で実行されるため、代わりに revalidateTag(tag, { expire: 0 }) で
// 即時失効させる。同じ問題を maintenance.revalidate が解決しており、
// { expire: 0 } を指定しないと即時失効が保証されない（本番で無効化されない不具合実績あり）。
function invalidateDbSheetCache(): void {
  try {
    revalidateTag('db-sheet', { expire: 0 });
  } catch {
    console.warn('Document committed; cache invalidation pending');
  }
}

function documents() {
  return createDocumentService(getDb(), getOwnerId());
}
async function navigation() {
  return (await documents().list()).map((s) => ({ id: s.sheetId, title: s.title, updatedAt: new Date(s.updatedAt) }));
}
async function documentCall<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof DocumentError) {
      const code =
        error.code === 'CONFLICT'
          ? 'CONFLICT'
          : error.code === 'NOT_FOUND'
            ? 'NOT_FOUND'
            : ['UNEDITABLE_DOCUMENT', 'INVALID_STATE'].includes(error.code)
              ? 'PRECONDITION_FAILED'
              : 'BAD_REQUEST';
      throw new TRPCError({ code, message: error.code });
    }
    throw error;
  }
}

export const sheetRouter = router({
  list: viewerProcedure.query(async () => ({ sheets: await navigation(), stale: false })),

  builderState: editorProcedure.input(builderStateInputSchema).query(async ({ input }) => {
    return documentCall(async () => {
      const result = await documents().read(input.sheetId ?? null);
      if (result.status === 'NOT_FOUND') throw new DocumentError('NOT_FOUND');
      return { ...result, sheets: await navigation() };
    });
  }),

  // tRPC procedure は throw された値を無条件で TRPCError にラップする（server caller 経由でも
  // 同様）ため、SkillSheetNotFoundError の instanceof チェックを呼び出し元に残す設計は使えない。
  // NOT_FOUND コードへ明示的にマップし、呼び出し元は TRPCError の code で判定する。
  byId: viewerProcedure.input(sheetIdInputSchema).query(async ({ input }) => {
    try {
      // fetchedAt は内部実装詳細（unstable_cache の再検証判定用）で、公開レスポンスに
      // 生のタイムスタンプとして出す意図はない。stale 判定結果だけを返す（レビュー指摘）。
      return toStaleSheet(await getCachedDbSheetById(input.id));
    } catch (err) {
      if (err instanceof SkillSheetNotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      }
      throw err;
    }
  }),

  getDefault: viewerProcedure.query(async () => toStaleSheet(await getCachedDbSheet())),

  save: editorProcedure.input(saveSheetInputSchema).mutation(async ({ input }) =>
    documentCall(async () => {
      const snapshot = await documents().replace(input.sheetId, input.expectedRevision, input.title, input.blocks);
      invalidateDbSheetCache();
      return snapshot;
    }),
  ),
  create: editorProcedure.input(createSheetInputSchema).mutation(async ({ input }) =>
    documentCall(async () => {
      const snapshot = await documents().create(input.sheetId, input.title, input.blocks);
      invalidateDbSheetCache();
      return snapshot;
    }),
  ),
  delete: editorProcedure.input(deleteSheetInputSchema).mutation(async ({ input }) =>
    documentCall(async () => {
      await documents().delete(input.sheetId, input.expectedRevision);
      invalidateDbSheetCache();
      return { ok: true as const };
    }),
  ),
});
