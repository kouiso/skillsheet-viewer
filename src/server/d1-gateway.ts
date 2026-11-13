import { type Block, filterVisibleProjectData, isBlockInput } from '../db/block';
import type { AuxiliaryOperation, GatewayOperation } from '../db/d1/contract';
import { gatewayOperationSchema } from '../db/d1/contract';
import { createDocumentHistory } from '../db/document-history';
import type { OperationConnection } from '../db/document-operation';
import { createDocumentService, DocumentError, readDocumentResult } from '../db/document-service';

export type D1Principal = { role: 'editor'; userId: string } | { role: 'viewer' };

export interface D1GatewayOptions {
  owner: string;
  connection: OperationConnection;
  authenticateService(request: Request): Promise<boolean>;
  authenticateUser(request: Request): Promise<D1Principal | null>;
  executeAuxiliary(request: AuxiliaryOperation): Promise<unknown>;
}

const MAX_BYTES = 1024 * 1024;
const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });

async function limitedJson(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new DocumentError('PAYLOAD_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new DocumentError('INVALID_REQUEST');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new DocumentError('PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new DocumentError('INVALID_REQUEST');
  }
}

/** サービス認証だけで利用者の権限を代用しない。未注入・不明ownerは起動時に拒否する。 */
export function createD1Gateway(options: D1GatewayOptions) {
  if (!options.owner || !options.authenticateService || !options.authenticateUser)
    throw new DocumentError('OWNER_REQUIRED');
  const documents = createDocumentService(options.connection, options.owner);
  const history = createDocumentHistory(options.connection, options.owner);
  async function dispatch(r: GatewayOperation, principal: D1Principal | null) {
    // 閲覧コードの照合前に必要な操作だけサービス認証で許す。本文・Drive・履歴は許さない。
    if (r.operation.startsWith('viewer.')) return options.executeAuxiliary(r as AuxiliaryOperation);
    if (!principal || (principal.role === 'editor' && principal.userId !== options.owner))
      throw new DocumentError('ACCESS_DENIED');
    if (principal.role !== 'editor' && r.operation !== 'read' && r.operation !== 'list')
      throw new DocumentError('ACCESS_DENIED');
    switch (r.operation) {
      case 'read': {
        const result = await documents.read(r.sheetId);
        if (principal.role !== 'viewer' || result.status !== 'OK') return result;
        if (!result.snapshot.blocks.every(isBlockInput)) throw new DocumentError('UNREADABLE_DOCUMENT');
        const blocks = (result.snapshot.blocks as Block[]).map((b) =>
          b.type === 'project' ? { ...b, data: filterVisibleProjectData(b.data) } : b,
        );
        return readDocumentResult({ status: 'OK', snapshot: { ...result.snapshot, blocks } });
      }
      case 'list':
        return documents.list();
      case 'create':
        return { status: 'OK', snapshot: await documents.create(r.sheetId, r.title, r.blocks) };
      case 'replace':
        return { status: 'OK', snapshot: await documents.replace(r.sheetId, r.expectedRevision, r.title, r.blocks) };
      case 'delete':
        await documents.delete(r.sheetId, r.expectedRevision);
        return { status: 'OK' };
      case 'history.restore': {
        if (!r.confirmation) throw new DocumentError('VISIBILITY_CONFIRMATION_REQUIRED');
        const result = await history.restore(r.sheetId, r.target, r.expectedRevision, r.confirmation);
        return { status: 'OK', snapshot: result.snapshot };
      }
      case 'history.restoreDeleted': {
        if (!r.confirmation) throw new DocumentError('VISIBILITY_CONFIRMATION_REQUIRED');
        return { status: 'OK', snapshot: await history.restoreDeleted(r.sheetId, r.expectedRevision, r.confirmation) };
      }
      case 'drive.read':
      case 'oauth.revoke':
      case 'drive.save':
      case 'drive.clear':
        return options.executeAuxiliary(r);
      case 'viewer.reserve':
      case 'viewer.check':
      case 'viewer.clear':
      case 'viewer.purge':
        return options.executeAuxiliary(r);
      default:
        return options.connection.documentOperation(r, options.owner);
    }
  }
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/operation')
        return response({ error: 'NOT_FOUND' }, 404);
      if (!(await options.authenticateService(request))) return response({ error: 'ACCESS_DENIED' }, 403);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
        return response({ error: 'INVALID_REQUEST' }, 415);
      const parsed = gatewayOperationSchema.safeParse(await limitedJson(request));
      if (!parsed.success) return response({ error: 'INVALID_REQUEST' }, 400);
      return response({ result: await dispatch(parsed.data, await options.authenticateUser(request)) });
    } catch (error) {
      if (error instanceof DocumentError) {
        const status =
          error.code === 'ACCESS_DENIED'
            ? 403
            : error.code === 'CONFLICT'
              ? 409
              : error.code === 'NOT_FOUND'
                ? 404
                : error.code === 'PAYLOAD_TOO_LARGE'
                  ? 413
                  : ['INVALID_DB_RESPONSE', 'SNAPSHOT_ID_MISMATCH', 'OWNER_REQUIRED'].includes(error.code)
                    ? 500
                    : 400;
        return response({ error: status === 500 ? 'INTERNAL_ERROR' : error.code }, status);
      }
      // SQL、利用者の本文、認証情報を応答や通常ログへ流さない。
      return response({ error: 'INTERNAL_ERROR' }, 500);
    }
  };
}
