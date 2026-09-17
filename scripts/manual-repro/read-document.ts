import { type Block, blocksToMarkdown, isBlockInput } from '../../src/db/blocks';
import type { Database } from '../../src/db/client';
import { createDocumentService, DocumentError } from '../../src/db/document-service';

/** 手動再現も限定snapshotを使い、解釈不能な原文を欠落させたPDFを検査しない。 */
export async function readReproDocument(
  db: Pick<Database, 'execute'>,
  owner: string,
  sheetId: string,
  referenceMonth: number,
) {
  if (!Number.isSafeInteger(referenceMonth) || referenceMonth < 0) throw new Error('INVALID_REFERENCE_MONTH');
  const result = await createDocumentService(db, owner).read(sheetId);
  if (result.status !== 'OK') throw new DocumentError(result.status);
  const snapshot = result.snapshot;
  if (!snapshot.blocks.every(isBlockInput)) throw new DocumentError('UNREADABLE_DOCUMENT');
  return { ...snapshot, referenceMonth, content: blocksToMarkdown(snapshot.blocks as Block[], referenceMonth) };
}
