import { TRPCError } from '@trpc/server';
import { getDb, getOwnerId, SkillSheetNotFoundError } from '@/db';
import { createDocumentService, DocumentError } from '@/db/document-service';
import { getCachedDbSheet, getCachedDbSheetById, toStaleSheet } from '@/server/sheet-cache';
import { invalidateDbSheetCache } from '@/server/sheet-service';

import { editorProcedure, router, viewerProcedure } from '../init';
import {
  builderStateInputSchema,
  createSheetInputSchema,
  deleteSheetInputSchema,
  saveSheetInputSchema,
  sheetIdInputSchema,
} from '../schema';

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
      // サーバ側の障害（権限・境界契約・owner 設定）はクライアントエラーとして報告しない。
      // BAD_REQUEST に潰すと deploy 破壊が「クライアントの入力ミス」に見えて監視をすり抜ける（#349）。
      const code =
        error.code === 'CONFLICT'
          ? 'CONFLICT'
          : error.code === 'NOT_FOUND'
            ? 'NOT_FOUND'
            : ['UNEDITABLE_DOCUMENT', 'INVALID_STATE'].includes(error.code)
              ? 'PRECONDITION_FAILED'
              : [
                    'ACCESS_DENIED',
                    'INVALID_DB_RESPONSE',
                    'SNAPSHOT_ID_MISMATCH',
                    'OWNER_REQUIRED',
                    'UNREADABLE_DOCUMENT',
                  ].includes(error.code)
                ? 'INTERNAL_SERVER_ERROR'
                : 'BAD_REQUEST';
      throw new TRPCError({ code, message: error.code });
    }
    throw error;
  }
}

export const sheetRouter = router({
  // navigation() は builderState と同じヘルパー。documentCall を通さないと
  // DocumentError がここだけ未マッピングの INTERNAL_SERVER_ERROR になり、
  // 同一障害でエラー契約が割れる（#349）。
  list: viewerProcedure.query(async () => documentCall(async () => ({ sheets: await navigation(), stale: false }))),

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
