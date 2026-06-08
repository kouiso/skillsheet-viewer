import registerPdfFonts from './pdf/fonts';
import { SkillSheetDocument, type SkillSheetDocumentProps } from './pdf/skill-sheet-document';

export type SkillSheetPDFProps = SkillSheetDocumentProps;

/**
 * スキルシート PDF コンポーネント。
 * ブラウザ用フォント（バンドルした Noto Sans JP）を登録したうえで、純粋描画の
 * SkillSheetDocument を返す。view.tsx から動的 import して PDF を生成する。
 */
export const SkillSheetPDF = ({ title, content }: SkillSheetPDFProps) => {
  registerPdfFonts();
  return <SkillSheetDocument title={title} content={content} />;
};

export default SkillSheetPDF;
