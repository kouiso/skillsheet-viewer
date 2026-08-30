import type { Block, BlockType } from '@/db/blocks';

import registerPdfFonts from './pdf/fonts';
import { PrintSkillSheetDocument } from './pdf/print-document';
import type { PrintViewKey } from './pdf/print-view-model';
import { SkillSheetDocument, type SkillSheetDocumentProps } from './pdf/skill-sheet-document';

export interface SkillSheetPDFProps extends SkillSheetDocumentProps {
  /** DB 由来の構造化ブロック。あるとき（DB 経路）は印刷デザインで描く。 */
  blocks?: Block[];
  /** 画面のビュートグルの状態。押した瞬間の状態がそのまま PDF に効く。 */
  views?: PrintViewKey[];
}

/**
 * スキルシート PDF コンポーネント。ブラウザ用フォント（バンドルした Noto Sans JP）を
 * 登録したうえでドキュメントを返す。sheet-view-client から動的 import して生成する。
 *
 * blocks があれば**印刷デザインの構造描画**（会社セクション + 案件カード）を使う。
 * 無い場合はレガシーの markdown 経路にフォールバックする — GitHub 閲覧経路
 * （`/view/[path]`）は markdown 文字列しか持たないため、この経路は消せない。
 * **レガシー経路には機能を足さない**（片方だけ直す事故を防ぐため凍結する）。
 */
/** 印刷デザインのビューモデルが実際に読むブロック種別。 */
const STRUCTURED_BLOCK_TYPES = new Set<BlockType>(['profile', 'skills', 'stats', 'project']);

/**
 * 印刷デザインで描いてよいブロック構成か。
 *
 * ビューモデルは profile / skills / stats / project しか読まない。`markdown` や `table`、
 * `experience` を含むシート（GitHub から取り込んだシートは本文が markdown ブロックで入る）を
 * そのまま構造描画に回すと、それらが 1 つも描かれずサマリだけの PDF が出る。
 * 構造化ブロックがあり、かつ描けないブロックが 1 つも無いときだけ印刷デザインを使う。
 */
function canRenderStructured(blocks: Block[] | undefined): blocks is Block[] {
  if (!blocks || blocks.length === 0) return false;
  return (
    blocks.some((b) => STRUCTURED_BLOCK_TYPES.has(b.type)) && blocks.every((b) => STRUCTURED_BLOCK_TYPES.has(b.type))
  );
}

export const SkillSheetPDF = ({ title, content, blocks, views }: SkillSheetPDFProps) => {
  registerPdfFonts();
  if (canRenderStructured(blocks)) return <PrintSkillSheetDocument title={title} blocks={blocks} views={views} />;
  return <SkillSheetDocument title={title} content={content} />;
};

// 失敗時の後始末も同じモジュールから出す。呼び出し側の catch で改めて動的 import すると、
// その await が終わるまで finally（ローディング解除）が走らず、ボタンが busy のまま残って
// 「押し直し」自体ができなくなる（実測でボタンが aria-busy のまま固まった）。
export { resetPdfFontsAfterFailure } from './pdf/fonts';

export default SkillSheetPDF;
