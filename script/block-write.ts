import type { Database } from '../src/db/client';
import { createDocumentService, DocumentError } from '../src/db/document-service';
import { getOwnerId } from '../src/db/skillsheet';
import { loadScriptEnv } from './env';

export interface BlockUpdate {
  id: string;
  sheetId: string;
  /** 読み取り時点のシート版。別編集が先行したら書き込まず中断する（R01: 時刻ではなく版で照合）。 */
  expectedRevision?: string;
  /** 更新後の data。ロック後のDB値と同値なら書き込みをスキップする。 */
  data: unknown;
  /** 読み取り時点の data。ロック後に変更前値として照合する。 */
  previous: unknown;
}

export interface WriteResult {
  written: number;
  skipped: number;
  sheets: number;
}

/**
 * v12移行ゲート。旧入口はowner/必須版/承認field hashを保証できない。
 * dry-runの計算は残すが、限定サービスと承認journalへ移行するまで直接書込みを拒否する。
 */
export async function writeBlockUpdates(_db: Database, updates: BlockUpdate[]): Promise<WriteResult> {
  if (updates.length === 0) return { written: 0, skipped: 0, sheets: 0 };
  throw new Error('LEGACY_WRITER_DISABLED: 文書サービスと承認journalへの移行が必要です');
}

/** 限定read/listで自己ownerの対象だけを解決する。明示IDでもowner検証を省略しない。 */
export async function resolveTargetSheetIds(db: Database, argv: string[]): Promise<string[]> {
  const service = createDocumentService(db, getOwnerId());
  const flagIndex = argv.findIndex((a) => a === '--sheet-id' || a.startsWith('--sheet-id='));
  if (flagIndex !== -1) {
    const raw = argv[flagIndex];
    const id = raw.includes('=') ? raw.slice(raw.indexOf('=') + 1) : argv[flagIndex + 1];
    if (!id) throw new Error('--sheet-id にシート ID を渡してください');
    const result = await service.read(id);
    if (result.status !== 'OK') throw new DocumentError(result.status);
    return [result.snapshot.sheetId];
  }
  const owned = await service.list();
  if (!owned.length) throw new Error('自己ownerのシートがありません');
  return owned.map((row) => row.sheetId);
}

/** 本文と版を単一snapshotから取得する。編集不能なrawを除外して候補を作らない。 */
export async function readTargetBlocks(db: Database, sheetIds: string[]) {
  const service = createDocumentService(db, getOwnerId());
  const rows = [];
  for (const sheetId of sheetIds) {
    const result = await service.read(sheetId);
    if (result.status !== 'OK') throw new DocumentError(result.status);
    const snapshot = result.snapshot;
    if (!snapshot.validation.editable) throw new DocumentError('UNEDITABLE_DOCUMENT', snapshot.validation.issues);
    rows.push(
      ...snapshot.blocks.map((block) => ({ ...block, sheetId: snapshot.sheetId, expectedRevision: snapshot.revision })),
    );
  }
  return rows;
}

/**
 * .env を読んで `DATABASE_URL` 等をプロセスへ流し込む。
 * 探す場所とパース規則は `./env` に集約してある（以前は各スクリプトが同じ処理を持っていた）。
 */
export function loadWebEnvLocal(): void {
  loadScriptEnv({ required: true });
}
