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
    // 明示されたサーバーの拒否を、別タブの同じ内容で成功に置き換えない。
    // 読戻しで照合するのは、結果が不明な通信・応答喪失の場合だけ。
    if (originalError !== null && typeof originalError === 'object') {
      const error = originalError as {
        data?: { code?: unknown };
        shape?: { data?: { code?: unknown } };
        message?: unknown;
      };
      if (
        typeof error.data?.code === 'string' ||
        typeof error.shape?.data?.code === 'string' ||
        (typeof error.message === 'string' &&
          ['CONFLICT', 'UNAUTHORIZED', 'FORBIDDEN', 'BAD_REQUEST', 'NOT_FOUND'].includes(error.message))
      )
        throw originalError;
    }
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
