import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { createDocumentHistory } from '../document-history';
import { createDocumentService, DocumentError } from '../document-service';
import { executeD1Auxiliary } from './auxiliary-store';
import type { D1Binding } from './binding';
import { createD1DocumentStore } from './document-store';

const sheet = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const blockId = '20000000-0000-4000-8000-000000000001';
const blocks = [{ id: blockId, type: 'markdown', order: 0, data: { markdown: '架空の合成本文' } }];
let platform: PlatformProxy<{ DB: D1Binding }>;
let db: D1Binding;
let store: ReturnType<typeof createD1DocumentStore>;
let service: ReturnType<typeof createDocumentService>;
let history: ReturnType<typeof createDocumentHistory>;
const statement = (sql: string, ...params: (string | number | null)[]) =>
  db
    .prepare(sql)
    .bind(...params)
    .all();
const transactions = async () => (await statement('SELECT id,transaction_id FROM d1_transactions ORDER BY id')).results;

it('移送した負のsigned32bit orderを格納保全し、業務編集では拒否する', async () => {
  await service.create(sheet, '架空', blocks);
  await statement('UPDATE blocks SET "order"=? WHERE id=?', -2147483648, blockId);
  expect((await statement('SELECT "order" FROM blocks WHERE id=?', blockId)).results).toEqual([{ order: -2147483648 }]);
  await expect(service.replace(sheet, '0', '不正連番', [{ ...blocks[0], order: -2147483648 }])).rejects.toBeInstanceOf(
    DocumentError,
  );
  expect((await statement('SELECT "order" FROM blocks WHERE id=?', blockId)).results).toEqual([{ order: -2147483648 }]);
});

// 失敗が本文だけでなく、版・削除ledger・初期化状態・永続操作識別も戻すことを比較する。
async function documentState() {
  const tables = ['skill_sheets', 'blocks', 'document_versions', 'deleted_documents', 'skillsheet_state'];
  return {
    documents: await Promise.all(
      tables.map(async (table) => (await statement(`SELECT * FROM ${table} ORDER BY rowid`)).results),
    ),
    transactions: await transactions(),
  };
}

beforeAll(async () => {
  platform = await getPlatformProxy<{ DB: D1Binding }>({
    configPath: 'wrangler.d1.jsonc',
    envFiles: [],
    persist: false,
    remoteBindings: false,
  });
  db = platform.env.DB;
  const schema = await readFile('src/db/d1/schema.sql', 'utf8');
  await db.batch(
    schema
      .split(';')
      .filter((sql) => sql.trim())
      .map((sql) => db.prepare(sql)),
  );
  store = createD1DocumentStore(db, 'synthetic-owner');
  service = createDocumentService(store, 'synthetic-owner');
  history = createDocumentHistory(store, 'synthetic-owner');
}, 30_000);
afterAll(async () => {
  await platform?.dispose();
});
afterEach(() => {
  vi.restoreAllMocks();
});
beforeEach(async () => {
  for (const table of [
    'blocks',
    'skill_sheets',
    'skillsheet_state',
    'document_versions',
    'deleted_documents',
    'd1_operation_guard',
    'd1_transactions',
    'viewer_login_attempt',
    'drive_destination',
  ]) {
    await statement(`DELETE FROM ${table}`);
  }
});

describe('ローカルworkerd D1の文書契約（実DB・Neon不使用）', () => {
  it('空状態、作成、同内容再送、別内容の競合、単一snapshot読取', async () => {
    expect(await service.read()).toEqual({ status: 'EMPTY' });
    const saved = await service.create(sheet, '合成', blocks);
    expect(saved.revision).toBe('0');
    expect(await service.create(sheet, '合成', blocks)).toEqual(saved);
    await expect(service.create(sheet, '別', blocks)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await service.read()).toEqual({ status: 'OK', snapshot: saved });
    expect(await service.list()).toMatchObject([{ sheetId: sheet, isDefault: true }]);
  });
  it('別ownerの読取・更新・履歴・期待owner偽装を拒否', async () => {
    await service.create(sheet, '合成', blocks);
    const foreign = createD1DocumentStore(db, 'other-owner');
    const foreignService = createDocumentService(foreign, 'other-owner');
    expect(await foreignService.read(sheet)).toEqual({ status: 'NOT_FOUND' });
    await expect(foreignService.replace(sheet, '0', 'bad', blocks)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(foreignService.create(sheet, 'bad', [])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await createDocumentHistory(foreign, 'other-owner').list(sheet)).toEqual([]);
    await expect(store.documentOperation({ operation: 'read', sheetId: sheet }, 'other-owner')).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
  });
  it('同じ版の2接続同時更新は1つだけ成功し、敗者がblocksを壊さない', async () => {
    await service.create(sheet, '合成', blocks);
    const second = createDocumentService(createD1DocumentStore(db, 'synthetic-owner'), 'synthetic-owner');
    const results = await Promise.allSettled([
      service.replace(sheet, '0', 'A', blocks),
      second.replace(sheet, '0', 'B', []),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toMatchObject([{ reason: { code: 'CONFLICT' } }]);
    const current = await service.read(sheet);
    expect(current.status).toBe('OK');
    if (current.status !== 'OK') throw new Error('missing snapshot');
    expect(current.snapshot.revision).toBe('1');
    expect(current.snapshot.blocks).toEqual(current.snapshot.title === 'A' ? blocks : []);
    expect((await statement('SELECT * FROM d1_operation_guard')).results).toEqual([]);
    expect(await history.list(sheet)).toHaveLength(2);
  });
  it('保存応答だけの喪失は1回の書込後に全文・直後版をreadbackし再送しない', async () => {
    await service.create(sheet, '合成', blocks);
    let writes = 0;
    const connection = {
      async documentOperation(...args: Parameters<typeof store.documentOperation>) {
        const result = await store.documentOperation(...args);
        if (args[0].operation === 'replace') {
          writes++;
          throw new DocumentError('GATEWAY_OUTCOME_UNKNOWN');
        }
        return result;
      },
    };
    const remote = createDocumentService(connection, 'synthetic-owner');
    expect(await remote.replace(sheet, '0', '応答が失われた合成更新', [])).toMatchObject({
      revision: '1',
      title: '応答が失われた合成更新',
      blocks: [],
    });
    expect(writes).toBe(1);
    expect(await history.list(sheet)).toHaveLength(2);
  });
  it('別シートのblock ID衝突は親・blocks・履歴・操作guardを全rollback', async () => {
    await service.create(sheet, '合成', blocks);
    await service.create(other, '第二', []);
    const before = await documentState();
    await expect(service.replace(other, '0', 'bad', blocks)).rejects.toThrow();
    expect(await documentState()).toEqual(before);
    expect(await service.read(other)).toMatchObject({
      status: 'OK',
      snapshot: { title: '第二', revision: '0', blocks: [] },
    });
    expect(await history.list(other)).toHaveLength(1);
    expect((await statement('SELECT * FROM d1_operation_guard')).results).toEqual([]);
  });
  it('JS整数精度を超えるrevisionの読取・CAS・履歴を文字列で保持', async () => {
    await service.create(sheet, '合成', blocks);
    await statement("UPDATE skill_sheets SET revision='9007199254740993' WHERE id=?", sheet);
    const saved = await service.replace(sheet, '9007199254740993', '大きい版', blocks);
    expect(saved.revision).toBe('9007199254740994');
    expect((await history.list(sheet))[0].revision).toBe('9007199254740994');
    expect((await history.read(sheet, '9007199254740993')).title).toBe('合成');
  });
  it('最大revisionをオーバーフローせず拒否', async () => {
    await service.create(sheet, '合成', blocks);
    await statement("UPDATE skill_sheets SET revision='9223372036854775807' WHERE id=?", sheet);
    await expect(service.replace(sheet, '9223372036854775807', 'bad', blocks)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(await service.read(sheet)).toMatchObject({ status: 'OK', snapshot: { revision: '9223372036854775807' } });
  });
  it('移行契約のTEXT版・桁境界順序・6桁UTC日時と操作ごとの64bit transaction ID', async () => {
    await service.create(sheet, '合成', blocks);
    await statement("UPDATE skill_sheets SET revision='9' WHERE id=?", sheet);
    await service.replace(sheet, '9', '10版', blocks);
    await statement("UPDATE skill_sheets SET revision='99' WHERE id=?", sheet);
    await service.replace(sheet, '99', '100版', blocks);
    expect((await history.list(sheet)).map((v) => v.revision)).toEqual(['100', '99', '10', '9', '0']);
    expect((await history.list(sheet, '10')).map((v) => v.revision)).toEqual(['9', '0']);
    expect(
      await store.documentOperation(
        { operation: 'history.countAfter', sheetId: sheet, target: '9', current: '100' },
        'synthetic-owner',
      ),
    ).toBe('3');
    const row = (await statement('SELECT typeof(revision) kind,updated_at FROM skill_sheets WHERE id=?', sheet))
      .results[0];
    expect(row.kind).toBe('text');
    expect(row.updated_at).toMatch(/\.\d{6}Z$/);
    const registry = await transactions();
    expect(registry).toHaveLength(3);
    for (const operation of registry) {
      expect(operation.transaction_id).toMatch(/^-[1-9][0-9]*$/);
      expect(BigInt(String(operation.transaction_id))).toBeGreaterThanOrEqual(-9223372036854775807n);
      expect(BigInt(String(operation.transaction_id))).toBeLessThan(0n);
    }
    const versions = (await statement('SELECT revision,transaction_id FROM document_versions WHERE sheet_id=?', sheet))
      .results;
    const transactionAt = (revision: string) =>
      versions.find((version) => version.revision === revision)?.transaction_id;
    expect(transactionAt('9')).toBe(transactionAt('10'));
    expect(transactionAt('99')).toBe(transactionAt('100'));
    expect(new Set(versions.map((version) => version.transaction_id))).toEqual(
      new Set(registry.map((operation) => operation.transaction_id)),
    );
  });
  it('SQL NULL/JSON nullを区別し巨大JSON数値とNULL配列要素を格納したまま保つ', async () => {
    await statement(
      'INSERT INTO oauth_client(id,client_id,redirect_uris,metadata) VALUES(?,?,?,?)',
      'synthetic-json',
      'synthetic-json',
      '["x",null,"x"]',
      'null',
    );
    await statement(
      'INSERT INTO oauth_client(id,client_id,redirect_uris,metadata) VALUES(?,?,?,?)',
      'synthetic-sql',
      'synthetic-sql',
      '[]',
      null,
    );
    const values = (await statement('SELECT id,metadata,typeof(metadata) kind FROM oauth_client ORDER BY id')).results;
    expect(values).toEqual([
      { id: 'synthetic-json', metadata: 'null', kind: 'text' },
      { id: 'synthetic-sql', metadata: null, kind: 'null' },
    ]);
    await service.create(sheet, '合成', blocks);
    await statement("UPDATE skill_sheets SET revision='1' WHERE id=?", sheet);
    const raw = '{"markdown":"架空","future":9223372036854775808123456789}';
    await statement('UPDATE blocks SET data=? WHERE id=?', raw, blockId);
    const preview = await history.previewRestore(sheet, '0', '1');
    await history.restore(sheet, '0', '1', preview.confirmation);
    const baseline = (await statement("SELECT blocks FROM document_versions WHERE sheet_id=? AND revision='1'", sheet))
      .results[0];
    expect(baseline.blocks).toContain('9223372036854775808123456789');
    expect(
      (await statement('SELECT redirect_uris FROM oauth_client WHERE id=?', 'synthetic-json')).results[0].redirect_uris,
    ).toBe('["x",null,"x"]');
  });
  it('未知rawを保持し編集を拒否、正常な過去版から復元可能', async () => {
    await service.create(sheet, '合成', blocks);
    await statement('UPDATE skill_sheets SET revision=1 WHERE id=?', sheet);
    await statement('UPDATE blocks SET data=? WHERE id=?', '{"markdown":"架空","future":"保持"}', blockId);
    expect(await service.read(sheet)).toMatchObject({
      status: 'OK',
      snapshot: { validation: { editable: false }, blocks: [{ data: { future: '保持' } }] },
    });
    await expect(service.replace(sheet, '1', 'bad', blocks)).rejects.toMatchObject({ code: 'UNEDITABLE_DOCUMENT' });
    const preview = await history.previewRestore(sheet, '0', '1');
    const restored = await history.restore(sheet, '0', '1', preview.confirmation);
    expect(restored.snapshot.revision).toBe('2');
    expect(restored.snapshot.blocks).toEqual(blocks);
    expect((await history.read(sheet, '1')).blocks[0].data).toEqual({ markdown: '架空', future: '保持' });
  });
  it('確定済み同revisionの本文不一致を検知して全rollback', async () => {
    await service.create(sheet, '合成', blocks);
    await statement('UPDATE skill_sheets SET title=? WHERE id=?', '外部改変した合成データ', sheet);
    const before = await documentState();
    await expect(service.replace(sheet, '0', '更新', blocks)).rejects.toThrow();
    expect(await documentState()).toEqual(before);
    expect(await service.read(sheet)).toMatchObject({
      status: 'OK',
      snapshot: { revision: '0', title: '外部改変した合成データ' },
    });
    expect((await history.read(sheet, '0')).title).toBe('合成');
    expect(await history.list(sheet)).toHaveLength(1);
    expect((await statement('SELECT * FROM d1_operation_guard')).results).toEqual([]);
  });
  it.each([
    ['owner_id', '別の合成owner'],
    ['title', '改ざんされた合成履歴'],
    ['blocks', '[]'],
  ])('確定済み履歴の%s改ざんは別操作で上書きせず操作識別もrollback', async (column, value) => {
    await service.create(sheet, '合成', blocks);
    await statement(`UPDATE document_versions SET ${column}=? WHERE sheet_id=? AND revision='0'`, value, sheet);
    const before = await documentState();
    await expect(service.replace(sheet, '0', '上書きしてはいけない更新', [])).rejects.toThrow();
    expect(await documentState()).toEqual(before);
    expect(await service.read(sheet)).toMatchObject({
      status: 'OK',
      snapshot: { revision: '0', title: '合成', blocks },
    });
    expect((await statement('SELECT * FROM d1_operation_guard')).results).toEqual([]);
  });
  it('移行済みPostgres transaction IDを保持し新しいD1操作だけ別の負IDを記録', async () => {
    await service.create(sheet, '合成', blocks);
    // 移行済み履歴を模した合成fixture。PGの64bit IDをNumber経由にしない。
    await statement("UPDATE document_versions SET transaction_id='9007199254740993' WHERE sheet_id=?", sheet);
    await statement('DELETE FROM d1_transactions');
    await service.replace(sheet, '0', 'D1で保存', []);
    const versions = (
      await statement('SELECT revision,transaction_id FROM document_versions WHERE sheet_id=? ORDER BY revision', sheet)
    ).results;
    expect(versions[0]).toEqual({ revision: '0', transaction_id: '9007199254740993' });
    expect(versions[1]).toMatchObject({ revision: '1' });
    expect(versions[1].transaction_id).toMatch(/^-[1-9][0-9]*$/);
    expect((await transactions()).map((operation) => operation.transaction_id)).toEqual([versions[1].transaction_id]);
  });
  it('削除と既定昇格は同じ操作IDを共有し次の独立した保存は別ID', async () => {
    await service.create(sheet, '第一', blocks);
    await service.create(other, '第二', []);
    const initialRegistry = await transactions();
    expect(initialRegistry).toHaveLength(2);
    expect(new Set(initialRegistry.map((operation) => operation.transaction_id)).size).toBe(2);
    await service.delete(sheet, '0');
    const deleted = (
      await statement("SELECT action,transaction_id FROM document_versions WHERE sheet_id=? AND revision='1'", sheet)
    ).results[0];
    const promoted = (
      await statement("SELECT action,transaction_id FROM document_versions WHERE sheet_id=? AND revision='1'", other)
    ).results[0];
    expect(deleted.action).toBe('delete');
    expect(promoted.action).toBe('save');
    expect(deleted.transaction_id).toBe(promoted.transaction_id);
    expect(initialRegistry.map((operation) => operation.transaction_id)).not.toContain(deleted.transaction_id);
    expect(await transactions()).toHaveLength(3);
    await service.replace(other, '1', '次の独立保存', []);
    const saved = (
      await statement("SELECT transaction_id FROM document_versions WHERE sheet_id=? AND revision='2'", other)
    ).results[0];
    expect(saved.transaction_id).not.toBe(deleted.transaction_id);
    expect(await transactions()).toHaveLength(4);
    expect(new Set((await transactions()).map((operation) => operation.transaction_id)).size).toBe(4);
    expect((await statement('SELECT * FROM d1_operation_guard')).results).toEqual([]);
  });
  it('別UUIDが同じ64bit操作IDに衝突したら既存registryと全文書状態を保持して拒否', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');
    uuid.mockReturnValueOnce('30000000-0000-4000-8000-000000000001');
    await service.create(sheet, '合成', blocks);
    const before = await documentState();
    // 下位のUUIDだけ異なるので、既存registryの64bit識別子と衝突する。
    uuid.mockReturnValue('30000000-0000-4000-8000-000000000002');
    await expect(service.replace(sheet, '0', '衝突した更新', [])).rejects.toThrow();
    expect(await documentState()).toEqual(before);
    expect((await statement('SELECT * FROM d1_operation_guard')).results).toEqual([]);
  });
  it('registryに無い移行済み履歴の操作IDと衝突しても新しい識別記録を残さずrollback', async () => {
    await service.create(sheet, '合成', blocks);
    // このUUIDの先頭64bitは0x4000。候補ID -16385を既存履歴だけに保つ。
    await statement("UPDATE document_versions SET transaction_id='-16385' WHERE sheet_id=?", sheet);
    await statement('DELETE FROM d1_transactions');
    const before = await documentState();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
    await expect(service.replace(sheet, '0', '移行済みIDと衝突', [])).rejects.toThrow();
    expect(await documentState()).toEqual(before);
    expect(await transactions()).toEqual([]);
    expect((await statement('SELECT * FROM d1_operation_guard')).results).toEqual([]);
  });
  it('save→復元→Undo、古い確認と再送を拒否、全版保持', async () => {
    await service.create(sheet, '合成', blocks);
    await service.replace(sheet, '0', '更新', []);
    const preview = await history.previewRestore(sheet, '0', '1');
    await expect(history.restore(sheet, '0', '1', 'x'.repeat(64))).rejects.toMatchObject({
      code: 'VISIBILITY_CONFIRMATION_REQUIRED',
    });
    const saved = await history.restore(sheet, '0', '1', preview.confirmation);
    expect(saved.snapshot.revision).toBe('2');
    await expect(history.restore(sheet, '0', '1', preview.confirmation)).rejects.toMatchObject({ code: 'CONFLICT' });
    const undo = await history.previewRestore(sheet, saved.undoRevision, '2');
    expect((await history.restore(sheet, saved.undoRevision, '2', undo.confirmation)).snapshot.title).toBe('更新');
    expect(await history.list(sheet)).toHaveLength(4);
  });
  it('削除の既定昇格・履歴・全削除後EMPTY・削除復元・tombstone維持', async () => {
    await service.create(sheet, '第一', blocks);
    await service.create(other, '第二', []);
    await service.delete(sheet, '0');
    expect(await service.read()).toMatchObject({ status: 'OK', snapshot: { sheetId: other, revision: '1' } });
    await expect(service.create(sheet, '第一', blocks)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await service.delete(other, '1');
    expect(await service.read()).toEqual({ status: 'EMPTY' });
    expect(await history.deletedList()).toHaveLength(2);
    const preview = await history.previewDeleted(sheet, '1');
    expect((await history.restoreDeleted(sheet, '1', preview.confirmation)).revision).toBe('2');
    await expect(service.create(sheet, '第一', blocks)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await history.list(sheet)).toHaveLength(3);
    await expect(history.restoreDeleted(sheet, '1', preview.confirmation)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('既定整合性が壊れた状態をdefault読取と作成・削除で拒否', async () => {
    await service.create(sheet, '第一', blocks);
    await statement('UPDATE skill_sheets SET is_default=0');
    expect(await service.read()).toEqual({ status: 'INVALID_STATE' });
    await expect(service.create(other, '第二', [])).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(service.delete(sheet, '0')).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('閲覧試行枠を原子的に8回へ制限しlockを延長しない', async () => {
    const now = Date.parse('2026-10-22T00:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        executeD1Auxiliary(db, 'synthetic-owner', { operation: 'viewer.reserve', key: 'unknown' }, now),
      ),
    );
    expect(results.filter((r) => r && 'locked' in r && !r.locked)).toHaveLength(8);
    expect(
      await executeD1Auxiliary(db, 'synthetic-owner', { operation: 'viewer.reserve', key: 'unknown' }, now + 1000),
    ).toMatchObject({ locked: true, retryAfterSeconds: 899 });
    expect(
      await executeD1Auxiliary(
        db,
        'synthetic-owner',
        { operation: 'viewer.reserve', key: 'unknown' },
        now + 16 * 60_000,
      ),
    ).toMatchObject({ locked: false, remainingAttempts: 7 });
  });
  it('Drive保存先のowner分離と消去', async () => {
    await executeD1Auxiliary(db, 'synthetic-owner', {
      operation: 'drive.save',
      folderId: 'fictional-folder',
      folderName: '架空',
    });
    expect(await executeD1Auxiliary(db, 'other-owner', { operation: 'drive.read' })).toBeNull();
    expect(await executeD1Auxiliary(db, 'synthetic-owner', { operation: 'drive.read' })).toEqual({
      folderId: 'fictional-folder',
      folderName: '架空',
    });
    await executeD1Auxiliary(db, 'synthetic-owner', { operation: 'drive.clear' });
    expect(await executeD1Auxiliary(db, 'synthetic-owner', { operation: 'drive.read' })).toBeNull();
  });
});
