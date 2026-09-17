import { canonicalJson, isRevision, type RawDocumentBlock } from '@/db/document-contract';
import type { DocumentRead, DocumentSnapshot } from '@/db/document-service';

type SavePayload = { sheetId: string; expectedRevision: string; title: string; blocks: RawDocumentBlock[] };

/** 応答喪失時は同じIDを非キャッシュで読戻す。再送や現在の下書きの置換は行わない。 */
export async function saveWithReadback(
  payload: SavePayload,
  save: (payload: SavePayload) => Promise<DocumentSnapshot>,
  read: (sheetId: string) => Promise<DocumentRead>,
): Promise<DocumentSnapshot> {
  try {
    return await save(payload);
  } catch (originalError) {
    try {
      const result = await read(payload.sheetId);
      if (result.status === 'OK') {
        const current = result.snapshot;
        if (
          current.sheetId === payload.sheetId &&
          isRevision(current.revision) &&
          isRevision(payload.expectedRevision) &&
          BigInt(current.revision) > BigInt(payload.expectedRevision) &&
          canonicalJson({ title: current.title, blocks: current.blocks }) ===
            canonicalJson({ title: payload.title, blocks: payload.blocks })
        )
          return current;
      }
    } catch {
      // 読戻し失敗で元の認可・競合エラーを隠さない。
    }
    throw originalError;
  }
}
