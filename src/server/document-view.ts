import 'server-only';
import { type Block, blocksToMarkdown, filterVisibleProjectData, isBlockInput } from '@/db/block';
import type { Database } from '@/db/client';
import { currentMonthKey } from '@/db/derived-display';
import { createDocumentService, DocumentError } from '@/db/document-service';
import { SkillSheetNotFoundError } from '@/db/skillsheet';

/** 表示用adapter。既定解決・初期化はDB限定readに委ね、書込みを行わない。 */
export async function readViewerDocument(
  db: Pick<Database, 'execute'>,
  owner: string,
  sheetId: string | null,
  referenceMonth = currentMonthKey(),
) {
  const result = await createDocumentService(db, owner).read(sheetId);
  if (result.status === 'NOT_FOUND') throw new SkillSheetNotFoundError(sheetId ?? 'default');
  if (result.status === 'INVALID_STATE') throw new DocumentError('INVALID_STATE');
  if (result.status === 'EMPTY')
    return { title: 'シートはまだありません', content: '', blocks: [] as Block[], revision: '0', referenceMonth };
  if (result.status !== 'OK') throw new DocumentError('INVALID_DB_RESPONSE');
  // 未対応keyはrawに保持する。解釈できないtype/壊れた本文を落として部分成功にしない。
  if (!result.snapshot.blocks.every(isBlockInput)) throw new DocumentError('UNREADABLE_DOCUMENT');
  const blocks = result.snapshot.blocks as Block[];
  // 閲覧面へ返す blocks から hidden 指定の会社・案件を除く。content(markdown)・xlsx・
  // クライアント描画では除外されていたのに、この JSON だけ素通しになっていた（#342）。
  // 編集者向けの全件取得は builderState / MCP get_sheet 側の別経路に残る。
  const visibleBlocks = blocks.map((block) =>
    block.type === 'project' ? { ...block, data: filterVisibleProjectData(block.data) } : block,
  );
  return {
    title: result.snapshot.title,
    content: blocksToMarkdown(visibleBlocks, referenceMonth),
    referenceMonth,
    blocks: visibleBlocks,
    revision: result.snapshot.revision,
  };
}

export async function readViewerList(db: Pick<Database, 'execute'>, owner: string) {
  return (await createDocumentService(db, owner).list()).map((s) => ({
    id: s.sheetId,
    title: s.title,
    updatedAt: new Date(s.updatedAt),
  }));
}
