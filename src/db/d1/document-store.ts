import { canonicalJson, type RawDocumentBlock, validateDocumentBlocks } from '../document-contract';
import type { DocumentOperation, OperationConnection } from '../document-operation';
import { DocumentError, readDocumentResult } from '../document-service';
import type { D1Binding, D1Result, D1Statement } from './binding';
import { documentOperationSchema } from './contract';
import { d1Timestamp, nextD1Revision } from './value';

// 親・子・既定判定を1 statementで読む。revisionは正規化済みの10進TEXTのまま扱う。
const snapshotSql = `WITH owned AS (SELECT * FROM skill_sheets WHERE owner_id=?1),
target AS (SELECT * FROM owned WHERE (?2 IS NOT NULL AND id=?2) OR (?2 IS NULL AND is_default=1)),
document AS (SELECT json_object('sheetId',s.id,'title',s.title,'revision',s.revision,
  'blocks',json(COALESCE((SELECT json_group_array(json(body)) FROM
    (SELECT json_object('id',id,'type',type,'order',"order",'data',json(data)) body
     FROM blocks WHERE sheet_id=s.id ORDER BY "order",id)), '[]'))) body FROM target s)
SELECT CASE WHEN ?2 IS NULL AND NOT EXISTS(SELECT 1 FROM owned) THEN json_object('status','EMPTY')
 WHEN ?2 IS NULL AND (SELECT count(*) FROM owned WHERE is_default=1)<>1 THEN json_object('status','INVALID_STATE')
 WHEN NOT EXISTS(SELECT 1 FROM document) THEN json_object('status','NOT_FOUND')
 ELSE json_object('status','OK','snapshot',json((SELECT body FROM document LIMIT 1))) END result`;

const blocksJson = `(SELECT COALESCE(json_group_array(json(body)),'[]') FROM
 (SELECT json_object('id',id,'type',type,'order',"order",'data',json(data)) body
  FROM blocks WHERE sheet_id=s.id ORDER BY "order",id))`;
const validDefaults = `(NOT EXISTS(SELECT 1 FROM skill_sheets WHERE owner_id=?2)
 OR (SELECT count(*) FROM skill_sheets WHERE owner_id=?2 AND is_default=1)=1)`;

function resultJson(result: D1Result): unknown {
  if (!result.success || result.results.length !== 1 || typeof result.results[0].result !== 'string')
    throw new DocumentError('INVALID_DB_RESPONSE');
  return JSON.parse(result.results[0].result);
}

/** 固定owner専用。全writerはD1 batchを使い、CAS・子交換・全版履歴を一緒にcommitする。 */
export function createD1DocumentStore(db: D1Binding, owner: string): OperationConnection {
  if (!owner) throw new DocumentError('OWNER_REQUIRED');
  const statement = (query: string, ...params: (string | number | null)[]) => db.prepare(query).bind(...params);
  const readStatement = (id: string | null) => statement(snapshotSql, owner, id);
  const one = async (query: string, ...params: (string | number | null)[]) =>
    resultJson(await statement(query, ...params).all());
  const read = async (id: string | null) => readDocumentResult(resultJson(await readStatement(id).all()));

  function assertEditable(title: string, blocks: RawDocumentBlock[]) {
    if (typeof title !== 'string') throw new DocumentError('INVALID_TITLE');
    const issues = validateDocumentBlocks(blocks);
    if (issues.length) throw new DocumentError('UNEDITABLE_DOCUMENT', issues);
    return canonicalJson(blocks);
  }

  // ランダム操作IDはtransaction内の条件フラグだけに使う。無条件の後続DELETEや
  // changes()頼みだと、競合CASに負けたwriterが勝者のblocksを消すため禁止する。
  function guard(token: string) {
    return `EXISTS(SELECT 1 FROM d1_operation_guard WHERE id='${token}')`;
  }
  function capture(token: string, action: string, now: string, id?: string, restored?: string, before?: string) {
    return statement(
      `INSERT INTO document_versions
      (sheet_id,owner_id,revision,title,blocks,action,recorded_at,transaction_id,restored_from,restored_before)
      SELECT s.id,s.owner_id,s.revision,s.title,${blocksJson},?,?,?,?,?
      FROM skill_sheets s WHERE s.owner_id=? AND ${id ? 's.id=? AND' : ''} ${guard(token)}
      ON CONFLICT(sheet_id,revision) DO UPDATE SET blocks=CASE
        WHEN document_versions.owner_id=excluded.owner_id AND document_versions.title=excluded.title
          AND NOT EXISTS(SELECT fullkey,type,CASE WHEN type IN ('integer','real') THEN document_versions.blocks -> fullkey ELSE atom END FROM json_tree(document_versions.blocks)
            EXCEPT SELECT fullkey,type,CASE WHEN type IN ('integer','real') THEN excluded.blocks -> fullkey ELSE atom END FROM json_tree(excluded.blocks))
          AND NOT EXISTS(SELECT fullkey,type,CASE WHEN type IN ('integer','real') THEN excluded.blocks -> fullkey ELSE atom END FROM json_tree(excluded.blocks)
            EXCEPT SELECT fullkey,type,CASE WHEN type IN ('integer','real') THEN document_versions.blocks -> fullkey ELSE atom END FROM json_tree(document_versions.blocks))
        THEN document_versions.blocks ELSE NULL END`,
      action,
      now,
      '-1',
      restored ?? null,
      before ?? null,
      owner,
      ...(id ? [id] : []),
    );
  }
  function insertBlocks(token: string, id: string, json: string) {
    return statement(
      `INSERT INTO blocks(id,sheet_id,type,"order",data)
      SELECT json_extract(value,'$.id'),?,json_extract(value,'$.type'),json_extract(value,'$.order'),
      json_extract(value,'$.data') FROM json_each(?) WHERE ${guard(token)}`,
      id,
      json,
    );
  }
  async function commit(
    token: string,
    queries: D1Statement[],
    id: string,
  ): Promise<{ changed: boolean; value: unknown }> {
    // readは同じbatch内。別writerの更新を保存応答に取り違えない。
    const results = await db.batch([
      ...queries,
      readStatement(id),
      statement('DELETE FROM d1_operation_guard WHERE id=?', token),
    ]);
    if (results.some((r) => !r.success)) throw new DocumentError('INVALID_DB_RESPONSE');
    return { changed: results[0].meta.changes === 1, value: resultJson(results[results.length - 2]) };
  }
  async function replace(request: Extract<DocumentOperation, { operation: 'replace' | 'history.restore' }>) {
    let title: string, blocks: RawDocumentBlock[];
    if (request.operation === 'history.restore') {
      const target = readDocumentResult(await historyRead(request.sheetId, request.target));
      if (target.status !== 'OK') return target;
      ({ title, blocks } = target.snapshot);
    } else {
      ({ title, blocks } = request);
    }
    const json = assertEditable(title, blocks);
    const token = crypto.randomUUID(),
      now = d1Timestamp();
    const { changed, value } = await commit(
      token,
      [
        statement(
          `INSERT INTO d1_operation_guard(id) SELECT ?1 WHERE EXISTS
        (SELECT 1 FROM skill_sheets WHERE owner_id=?2 AND id=?3 AND revision=?4
          AND revision<>'9223372036854775807')`,
          token,
          owner,
          request.sheetId,
          request.expectedRevision,
        ),
        capture(token, 'baseline', now, request.sheetId),
        statement(
          `UPDATE skill_sheets SET title=?,revision=?,updated_at=?
        WHERE owner_id=? AND id=? AND ${guard(token)}`,
          title,
          nextD1Revision(request.expectedRevision),
          now,
          owner,
          request.sheetId,
        ),
        statement(`DELETE FROM blocks WHERE sheet_id=? AND ${guard(token)}`, request.sheetId),
        insertBlocks(token, request.sheetId, json),
        capture(
          token,
          request.operation === 'replace' ? 'save' : 'restore',
          now,
          request.sheetId,
          request.operation === 'history.restore' ? request.target : undefined,
          request.operation === 'history.restore' ? request.expectedRevision : undefined,
        ),
      ],
      request.sheetId,
    );
    if (changed) return value;
    return { status: readDocumentResult(value).status === 'OK' ? 'CONFLICT' : 'NOT_FOUND' };
  }
  async function create(request: Extract<DocumentOperation, { operation: 'create' }>) {
    const json = assertEditable(request.title, request.blocks);
    const token = crypto.randomUUID(),
      now = d1Timestamp();
    const { changed, value } = await commit(
      token,
      [
        statement(
          `INSERT INTO d1_operation_guard(id) SELECT ?1 WHERE ${validDefaults}
        AND NOT EXISTS(SELECT 1 FROM skill_sheets WHERE id=?3)
        AND NOT EXISTS(SELECT 1 FROM skillsheet_state,json_each(deleted_sheet_ids)
          WHERE owner_id=?2 AND value=?3)`,
          token,
          owner,
          request.sheetId,
        ),
        statement(
          `INSERT INTO skillsheet_state(owner_id,deleted_sheet_ids,initialized_at)
        SELECT ?,'[]',? WHERE ${guard(token)} ON CONFLICT(owner_id) DO NOTHING`,
          owner,
          now,
        ),
        statement(
          `INSERT INTO skill_sheets(id,owner_id,title,theme,is_default,created_at,updated_at,revision)
        SELECT ?,?,?,'light',NOT EXISTS(SELECT 1 FROM skill_sheets WHERE owner_id=?),?,?,'0'
        WHERE ${guard(token)}`,
          request.sheetId,
          owner,
          request.title,
          owner,
          now,
          now,
        ),
        insertBlocks(token, request.sheetId, json),
        capture(token, 'create', now, request.sheetId),
      ],
      request.sheetId,
    );
    if (changed) return value;
    const tombstone = await one(
      `SELECT json(CASE WHEN EXISTS(SELECT 1 FROM skillsheet_state,json_each(deleted_sheet_ids)
      WHERE owner_id=? AND value=?) THEN 'true' ELSE 'false' END) result`,
      owner,
      request.sheetId,
    );
    if (tombstone) return { status: 'NOT_FOUND' };
    const defaults = await read(null);
    if (defaults.status === 'INVALID_STATE') return { status: 'INVALID_STATE' };
    const current = readDocumentResult(value);
    if (current.status === 'OK') {
      if (current.snapshot.title === request.title && canonicalJson(current.snapshot.blocks) === json) return value;
      return { status: 'CONFLICT' };
    }
    return { status: 'NOT_FOUND' };
  }
  async function remove(request: Extract<DocumentOperation, { operation: 'delete' }>) {
    const candidate = (
      await statement(
        `SELECT id,revision FROM skill_sheets WHERE owner_id=? AND id<>?
      ORDER BY created_at,id LIMIT 1`,
        owner,
        request.sheetId,
      ).all()
    ).results[0];
    const promotedId = candidate ? String(candidate.id) : null;
    const promotedRevision = candidate ? String(candidate.revision) : '0';
    const nextRevision = nextD1Revision(request.expectedRevision);
    const token = crypto.randomUUID(),
      now = d1Timestamp();
    const { changed, value } = await commit(
      token,
      [
        statement(
          `INSERT INTO d1_operation_guard(id) SELECT ?1 WHERE ${validDefaults} AND EXISTS
        (SELECT 1 FROM skill_sheets WHERE owner_id=?2 AND id=?3 AND revision=?4 AND revision<>'9223372036854775807')
        AND (NOT EXISTS(SELECT 1 FROM skill_sheets WHERE owner_id=?2 AND id=?3 AND is_default=1)
          OR (?5 IS NULL AND NOT EXISTS(SELECT 1 FROM skill_sheets WHERE owner_id=?2 AND id<>?3))
          OR (?5=(SELECT id FROM skill_sheets WHERE owner_id=?2 AND id<>?3 ORDER BY created_at,id LIMIT 1)
            AND EXISTS(SELECT 1 FROM skill_sheets WHERE id=?5 AND owner_id=?2 AND revision=?6 AND revision<>'9223372036854775807')))`,
          token,
          owner,
          request.sheetId,
          request.expectedRevision,
          promotedId,
          promotedRevision,
        ),
        capture(token, 'baseline', now),
        statement(
          `INSERT INTO document_versions(sheet_id,owner_id,revision,title,blocks,action,recorded_at,transaction_id)
        SELECT s.id,s.owner_id,?,s.title,${blocksJson},'delete',?,'-1'
        FROM skill_sheets s WHERE s.id=? AND s.owner_id=? AND ${guard(token)}`,
          nextRevision,
          now,
          request.sheetId,
          owner,
        ),
        statement(
          `INSERT INTO deleted_documents(sheet_id,owner_id,revision,deleted_at)
        SELECT id,owner_id,?,? FROM skill_sheets WHERE id=? AND owner_id=? AND ${guard(token)}
        ON CONFLICT(sheet_id) DO UPDATE SET revision=excluded.revision,deleted_at=excluded.deleted_at`,
          nextRevision,
          now,
          request.sheetId,
          owner,
        ),
        statement(
          `INSERT INTO skillsheet_state(owner_id,deleted_sheet_ids,initialized_at)
        SELECT ?,json_array(?),? WHERE ${guard(token)} ON CONFLICT(owner_id) DO UPDATE SET
        deleted_sheet_ids=json_insert(deleted_sheet_ids,'$[#]',?)`,
          owner,
          request.sheetId,
          now,
          request.sheetId,
        ),
        statement(`DELETE FROM blocks WHERE sheet_id=? AND ${guard(token)}`, request.sheetId),
        statement(`DELETE FROM skill_sheets WHERE id=? AND owner_id=? AND ${guard(token)}`, request.sheetId, owner),
        statement(
          `UPDATE skill_sheets SET is_default=1,revision=?,updated_at=? WHERE id=? AND owner_id=?
        AND NOT EXISTS(SELECT 1 FROM skill_sheets WHERE owner_id=? AND is_default=1) AND ${guard(token)}`,
          nextD1Revision(promotedRevision),
          now,
          promotedId,
          owner,
          owner,
        ),
        capture(token, 'save', now),
      ],
      request.sheetId,
    );
    if (changed) return { status: 'OK' };
    if ((await read(null)).status === 'INVALID_STATE') return { status: 'INVALID_STATE' };
    return { status: readDocumentResult(value).status === 'OK' ? 'CONFLICT' : 'NOT_FOUND' };
  }
  const historyRead = (id: string, revision: string) =>
    one(
      `SELECT COALESCE((SELECT json_object(
    'status','OK','snapshot',json_object('sheetId',sheet_id,'title',title,'revision',revision,
    'blocks',json(blocks))) FROM document_versions WHERE owner_id=? AND sheet_id=? AND revision=?),
    json_object('status','NOT_FOUND')) result`,
      owner,
      id,
      revision,
    );

  async function restoreDeleted(request: Extract<DocumentOperation, { operation: 'history.restoreDeleted' }>) {
    const target = readDocumentResult(await historyRead(request.sheetId, request.expectedRevision));
    if (target.status !== 'OK') return target;
    const json = assertEditable(target.snapshot.title, target.snapshot.blocks);
    const token = crypto.randomUUID(),
      now = d1Timestamp();
    const { changed, value } = await commit(
      token,
      [
        statement(
          `INSERT INTO d1_operation_guard(id) SELECT ?1 WHERE ${validDefaults}
        AND EXISTS(SELECT 1 FROM deleted_documents WHERE owner_id=?2 AND sheet_id=?3
          AND revision=?4 AND revision<>'9223372036854775807')
        AND NOT EXISTS(SELECT 1 FROM skill_sheets WHERE id=?3)`,
          token,
          owner,
          request.sheetId,
          request.expectedRevision,
        ),
        statement(
          `INSERT INTO skill_sheets(id,owner_id,title,theme,is_default,created_at,updated_at,revision)
        SELECT ?,?,?,'light',NOT EXISTS(SELECT 1 FROM skill_sheets WHERE owner_id=?),?,?,?
        WHERE ${guard(token)}`,
          request.sheetId,
          owner,
          target.snapshot.title,
          owner,
          now,
          now,
          nextD1Revision(request.expectedRevision),
        ),
        insertBlocks(token, request.sheetId, json),
        capture(token, 'restore-deleted', now, request.sheetId, request.expectedRevision),
        statement(
          `DELETE FROM deleted_documents WHERE owner_id=? AND sheet_id=? AND ${guard(token)}`,
          owner,
          request.sheetId,
        ),
      ],
      request.sheetId,
    );
    return changed ? value : { status: 'CONFLICT' };
  }

  return {
    async documentOperation(input, expectedOwner) {
      if (owner !== expectedOwner) throw new DocumentError('ACCESS_DENIED');
      const r = documentOperationSchema.parse(input);
      switch (r.operation) {
        case 'read':
          return read(r.sheetId);
        case 'list':
          return one(
            `SELECT COALESCE(json_group_array(json(body)),'[]') result FROM
          (SELECT json_object('sheetId',id,'title',title,'isDefault',json(CASE WHEN is_default=1 THEN 'true' ELSE 'false' END),
           'createdAt',created_at,'updatedAt',updated_at) body FROM skill_sheets WHERE owner_id=? ORDER BY created_at,id)`,
            owner,
          );
        case 'create':
          return create(r);
        case 'replace':
          return replace(r);
        case 'delete':
          return remove(r);
        case 'history.read':
          return historyRead(r.sheetId, r.revision);
        case 'history.list':
          return one(
            `SELECT COALESCE(json_group_array(json(body)),'[]') result FROM
          (SELECT json_object('revision',revision,'title',title,'recordedAt',recorded_at,'action',action,
           'restoredFrom',restored_from,'restoredBefore',restored_before) body
           FROM document_versions WHERE owner_id=? AND sheet_id=? AND (?3 IS NULL OR length(revision)<length(?3) OR (length(revision)=length(?3) AND revision<?3))
           ORDER BY length(revision) DESC, revision DESC LIMIT ?4)`,
            owner,
            r.sheetId,
            r.before,
            r.limit,
          );
        case 'history.countAfter':
          return one(
            `SELECT json_quote(CAST(count(*) AS TEXT)) result FROM document_versions
          WHERE owner_id=? AND sheet_id=? AND (length(revision)>length(?3) OR (length(revision)=length(?3) AND revision>?3))
          AND (length(revision)<length(?4) OR (length(revision)=length(?4) AND revision<=?4))`,
            owner,
            r.sheetId,
            r.target,
            r.current,
          );
        case 'history.restore':
          return replace(r);
        case 'history.deletedList':
          return one(
            `SELECT COALESCE(json_group_array(json(body)),'[]') result FROM
          (SELECT json_object('sheetId',d.sheet_id,'revision',d.revision,'title',v.title,'deletedAt',d.deleted_at) body
           FROM deleted_documents d JOIN document_versions v ON v.sheet_id=d.sheet_id AND v.revision=d.revision AND v.owner_id=d.owner_id
           WHERE d.owner_id=? ORDER BY d.deleted_at DESC,d.sheet_id)`,
            owner,
          );
        case 'history.restoreDeleted':
          return restoreDeleted(r);
      }
    },
  };
}
