import { type SQL, sql } from 'drizzle-orm';
import type { DocumentConnection, DocumentOperation } from './document-operation';
import { DocumentError, readDocumentResult } from './document-service';

/** 履歴用SQLの入口。テーブル直読を避け、固定ownerを全DB関数へ渡す。 */
export function createHistoryRepository(db: DocumentConnection, owner: string) {
  if (!owner) throw new DocumentError('OWNER_REQUIRED');
  async function execute(query: SQL, request: DocumentOperation): Promise<unknown> {
    if ('documentOperation' in db) return db.documentOperation(request, owner);
    try {
      const result = await db.execute(query);
      if (result.rows.length !== 1 || !Object.hasOwn(result.rows[0], 'result'))
        throw new DocumentError('INVALID_DB_RESPONSE');
      return result.rows[0].result;
    } catch (error) {
      const e = error as { code?: string; cause?: { code?: string } };
      if (e?.code === '42501' || e?.cause?.code === '42501') throw new DocumentError('ACCESS_DENIED');
      throw error;
    }
  }
  return {
    list: (id: string, before: string | null, limit: number) =>
      execute(
        sql`select skillsheet_private.history_list(${id}::uuid,${before}::text,${limit}::integer,${owner}::text) as result`,
        { operation: 'history.list', sheetId: id, before, limit },
      ),
    read: async (id: string, revision: string) =>
      readDocumentResult(
        await execute(
          sql`select skillsheet_private.history_read(${id}::uuid,${revision}::text,${owner}::text) as result`,
          { operation: 'history.read', sheetId: id, revision },
        ),
      ),
    countAfter: (id: string, target: string, current: string) =>
      execute(
        sql`select skillsheet_private.history_count_after(${id}::uuid,${target}::text,${current}::text,${owner}::text) as result`,
        { operation: 'history.countAfter', sheetId: id, target, current },
      ),
    restore: async (id: string, target: string, expected: string, confirmation?: string) =>
      execute(
        sql`select skillsheet_private.history_restore(${id}::uuid,${target}::text,${expected}::text,${owner}::text) as result`,
        { operation: 'history.restore', sheetId: id, target, expectedRevision: expected, confirmation },
      ),
    deletedList: () =>
      execute(sql`select skillsheet_private.deleted_document_list(${owner}::text) as result`, {
        operation: 'history.deletedList',
      }),
    restoreDeleted: (id: string, expected: string, confirmation?: string) =>
      execute(
        sql`select skillsheet_private.restore_deleted_document(${id}::uuid,${expected}::text,${owner}::text) as result`,
        { operation: 'history.restoreDeleted', sheetId: id, expectedRevision: expected, confirmation },
      ),
  };
}
