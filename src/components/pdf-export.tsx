import type { Block } from '@/db/blocks';

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
export const SkillSheetPDF = ({ title, content, blocks, views }: SkillSheetPDFProps) => {
  registerPdfFonts();
  if (blocks && blocks.length > 0) return <PrintSkillSheetDocument title={title} blocks={blocks} views={views} />;
  return <SkillSheetDocument title={title} content={content} />;
};

export default SkillSheetPDF;
