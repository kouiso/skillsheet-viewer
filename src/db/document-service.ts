import { type SQL, sql } from 'drizzle-orm';
import type { Database } from './client';
import {
  canonicalJson,
  type DocumentIssue,
  isRevision,
  type RawDocumentBlock,
  validateDocumentBlocks,
} from './document-contract';
import type { DocumentConnection, DocumentOperation } from './document-operation';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class DocumentError extends Error {
  constructor(
    readonly code: string,
    readonly issues: DocumentIssue[] = [],
  ) {
    super(code);
    this.name = 'DocumentError';
  }
}

export interface DocumentSnapshot {
  sheetId: string;
  title: string;
  revision: string;
  blocks: RawDocumentBlock[];
  validation: { editable: boolean; issues: DocumentIssue[] };
}
export type DocumentRead =
  | { status: 'OK'; snapshot: DocumentSnapshot }
  | { status: 'EMPTY' | 'INVALID_STATE' | 'NOT_FOUND' };

export interface DocumentSummary {
  sheetId: string;
  title: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requireId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !uuid.test(id)) throw new DocumentError('INVALID_ID');
}
function requireRevision(revision: unknown): asserts revision is string {
  if (!isRevision(revision)) throw new DocumentError('INVALID_REVISION');
}
function rawBlocks(value: unknown): RawDocumentBlock[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (b) =>
        record(b) &&
        typeof b.id === 'string' &&
        typeof b.type === 'string' &&
        Number.isInteger(b.order) &&
        Object.hasOwn(b, 'data'),
    )
  ) {
    throw new DocumentError('INVALID_DB_RESPONSE');
  }
  return value as RawDocumentBlock[];
}
export function readDocumentResult(value: unknown): DocumentRead {
  if (!record(value)) throw new DocumentError('INVALID_DB_RESPONSE');
  if (value.status === 'EMPTY' || value.status === 'INVALID_STATE' || value.status === 'NOT_FOUND') {
    return { status: value.status };
  }
  if (value.status !== 'OK' || !record(value.snapshot)) throw new DocumentError('INVALID_DB_RESPONSE');
  const raw = value.snapshot;
  requireId(raw.sheetId);
  requireRevision(raw.revision);
  if (typeof raw.title !== 'string') throw new DocumentError('INVALID_DB_RESPONSE');
  const blocks = rawBlocks(raw.blocks);
  const issues = validateDocumentBlocks(blocks);
  return {
    status: 'OK',
    snapshot: {
      sheetId: raw.sheetId,
      title: raw.title,
      revision: raw.revision,
      blocks,
      validation: { editable: issues.length === 0, issues },
    },
  };
}

/** 全writerで共有する文書境界。認証済みアプリの固定ownerを必ずDBへ渡す。 */
export function createDocumentService(db: DocumentConnection, expectedOwner: string) {
  if (!expectedOwner) throw new DocumentError('OWNER_REQUIRED');
  async function execute(query: SQL, request: DocumentOperation): Promise<unknown> {
    if ('documentOperation' in db) return db.documentOperation(request, expectedOwner);
    let result: Awaited<ReturnType<Database['execute']>>;
    try {
      result = await db.execute(query);
    } catch (error) {
      if (record(error) && (error.code === '42501' || (record(error.cause) && error.cause.code === '42501'))) {
        throw new DocumentError('ACCESS_DENIED');
      }
      throw error;
    }
    if (result.rows.length !== 1 || !Object.hasOwn(result.rows[0], 'result'))
      throw new DocumentError('INVALID_DB_RESPONSE');
    return result.rows[0].result;
  }
  async function read(sheetId: string | null = null): Promise<DocumentRead> {
    if (sheetId !== null) requireId(sheetId);
    const result = readDocumentResult(
      await execute(sql`select skillsheet_private.read_snapshot(${sheetId}::uuid, ${expectedOwner}::text) as result`, {
        operation: 'read',
        sheetId,
      }),
    );
    if (sheetId && result.status === 'OK' && result.snapshot.sheetId.toLowerCase() !== sheetId.toLowerCase()) {
      throw new DocumentError('SNAPSHOT_ID_MISMATCH');
    }
    return result;
  }
  function payload(title: string, blocks: RawDocumentBlock[]): string {
    if (typeof title !== 'string') throw new DocumentError('INVALID_TITLE');
    rawBlocks(blocks);
    const issues = validateDocumentBlocks(blocks);
    if (issues.length) throw new DocumentError('UNEDITABLE_DOCUMENT', issues);
    return canonicalJson(blocks);
  }
  function saved(value: unknown): DocumentSnapshot {
    if (
      record(value) &&
      (value.status === 'CONFLICT' || value.status === 'NOT_FOUND' || value.status === 'INVALID_STATE')
    ) {
      throw new DocumentError(value.status);
    }
    const result = readDocumentResult(value);
    if (result.status !== 'OK') throw new DocumentError('INVALID_DB_RESPONSE');
    return result.snapshot;
  }
  return {
    read,
    /** navigation専用。編集中のIDと版はreadのsnapshotからだけ取得する。 */
    async list(): Promise<DocumentSummary[]> {
      const result = await execute(sql`select skillsheet_private.list_sheets(${expectedOwner}::text) as result`, {
        operation: 'list',
      });
      if (!Array.isArray(result)) throw new DocumentError('INVALID_DB_RESPONSE');
      const ids = new Set<string>();
      return result.map((row) => {
        if (!record(row)) throw new DocumentError('INVALID_DB_RESPONSE');
        requireId(row.sheetId);
        if (
          ids.has(row.sheetId.toLowerCase()) ||
          typeof row.title !== 'string' ||
          typeof row.isDefault !== 'boolean' ||
          typeof row.createdAt !== 'string' ||
          !Number.isFinite(Date.parse(row.createdAt)) ||
          typeof row.updatedAt !== 'string' ||
          !Number.isFinite(Date.parse(row.updatedAt))
        ) {
          throw new DocumentError('INVALID_DB_RESPONSE');
        }
        ids.add(row.sheetId.toLowerCase());
        return {
          sheetId: row.sheetId,
          title: row.title,
          isDefault: row.isDefault,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });
    },
    async create(sheetId: string, title: string, blocks: RawDocumentBlock[]): Promise<DocumentSnapshot> {
      requireId(sheetId);
      const json = payload(title, blocks);
      return saved(
        await execute(
          sql`select skillsheet_private.create_sheet(${sheetId}::uuid, ${title}::text, ${json}::jsonb, ${expectedOwner}::text) as result`,
          { operation: 'create', sheetId, title, blocks },
        ),
      );
    },
    async replace(
      sheetId: string,
      expectedRevision: string,
      title: string,
      blocks: RawDocumentBlock[],
    ): Promise<DocumentSnapshot> {
      requireId(sheetId);
      requireRevision(expectedRevision);
      const json = payload(title, blocks);
      const current = await read(sheetId);
      if (current.status !== 'OK') throw new DocumentError(current.status);
      if (current.snapshot.revision !== expectedRevision) throw new DocumentError('CONFLICT');
      if (!current.snapshot.validation.editable)
        throw new DocumentError('UNEDITABLE_DOCUMENT', current.snapshot.validation.issues);
      // 検査後の競合はDB CASで拒否する。読取成功を更新権限や版一致の代用にしない。
      try {
        return saved(
          await execute(
            sql`select skillsheet_private.replace_sheet(${sheetId}::uuid, ${expectedRevision}::text, ${title}::text, ${json}::jsonb, ${expectedOwner}::text) as result`,
            { operation: 'replace', sheetId, expectedRevision, title, blocks },
          ),
        );
      } catch (error) {
        // Vercel→Worker間の応答だけ失われた場合も再送しない。DBから同IDを読み、
        // 直後の版・全文一致だけを保存済みと確認する。明示拒否はここへ入れない。
        if (error instanceof DocumentError && error.code === 'GATEWAY_OUTCOME_UNKNOWN') {
          try {
            const result = await read(sheetId);
            if (
              result.status === 'OK' &&
              result.snapshot.revision === (BigInt(expectedRevision) + 1n).toString() &&
              result.snapshot.title === title &&
              canonicalJson(result.snapshot.blocks) === json
            )
              return result.snapshot;
          } catch {
            /* 読戻しの失敗で元の結果不明を隠さない。 */
          }
        }
        throw error;
      }
    },
    async delete(sheetId: string, expectedRevision: string): Promise<void> {
      requireId(sheetId);
      requireRevision(expectedRevision);
      const result = await execute(
        sql`select skillsheet_private.delete_sheet(${sheetId}::uuid, ${expectedRevision}::text, ${expectedOwner}::text) as result`,
        { operation: 'delete', sheetId, expectedRevision },
      );
      if (!record(result) || !['OK', 'NOT_FOUND', 'CONFLICT', 'INVALID_STATE'].includes(String(result.status))) {
        throw new DocumentError('INVALID_DB_RESPONSE');
      }
      if (result.status !== 'OK') throw new DocumentError(String(result.status));
    },
  };
}
