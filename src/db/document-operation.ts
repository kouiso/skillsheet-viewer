import type { Database } from './client';
import type { RawDocumentBlock } from './document-contract';

/** SQL を接続境界へ流さないための業務操作 DTO。owner は接続設定からだけ与える。 */
export type DocumentOperation =
  | { operation: 'read'; sheetId: string | null }
  | { operation: 'list' }
  | { operation: 'create'; sheetId: string; title: string; blocks: RawDocumentBlock[] }
  | { operation: 'replace'; sheetId: string; expectedRevision: string; title: string; blocks: RawDocumentBlock[] }
  | { operation: 'delete'; sheetId: string; expectedRevision: string }
  | { operation: 'history.list'; sheetId: string; before: string | null; limit: number }
  | { operation: 'history.read'; sheetId: string; revision: string }
  | { operation: 'history.countAfter'; sheetId: string; target: string; current: string }
  | { operation: 'history.restore'; sheetId: string; target: string; expectedRevision: string; confirmation?: string }
  | { operation: 'history.deletedList' }
  | { operation: 'history.restoreDeleted'; sheetId: string; expectedRevision: string; confirmation?: string };

export interface OperationConnection {
  documentOperation(request: DocumentOperation, expectedOwner: string): Promise<unknown>;
}

export type DocumentConnection = Pick<Database, 'execute'> | OperationConnection;
