import { randomUUID } from 'node:crypto';
import { readReproDocument } from '../script/manual-repro/read-document';
import type { Block, BlockInput } from '../src/db/block';
import { getDb } from '../src/db/client';
import { currentMonthKey } from '../src/db/derived-display';
import { createDocumentService, DocumentError } from '../src/db/document-service';
import { getOwnerId } from '../src/db/skillsheet';

/** E2E準備用。各呼出しは独立した新規fixture操作であり、本番の作成再試行には使わない。 */
export async function createSheet(title: string, initialBlocks: BlockInput[] = []) {
  const snapshot = await createDocumentService(getDb(), getOwnerId()).create(
    randomUUID(),
    title,
    initialBlocks.map((block, order) => ({ ...block, id: randomUUID(), order })),
  );
  return snapshot.sheetId;
}

/** 後片付けでも最新snapshotの版を必須にし、読取後の競合は失敗させる。 */
export async function deleteSheet(sheetId: string) {
  const service = createDocumentService(getDb(), getOwnerId());
  const result = await service.read(sheetId);
  if (result.status !== 'OK') throw new DocumentError(result.status);
  await service.delete(sheetId, result.snapshot.revision);
}

export async function listSheets() {
  return (await createDocumentService(getDb(), getOwnerId()).list()).map((sheet) => ({
    id: sheet.sheetId,
    title: sheet.title,
    updatedAt: new Date(sheet.updatedAt),
  }));
}

export async function getSkillSheetById(sheetId: string, referenceMonth = currentMonthKey()) {
  const snapshot = await readReproDocument(getDb(), getOwnerId(), sheetId, referenceMonth);
  return { ...snapshot, blocks: snapshot.blocks as Block[] };
}
