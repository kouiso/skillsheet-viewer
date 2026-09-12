import type { SkillSheetPDFProps } from '@/components/pdf-export';

/** PDF生成と、失敗したフォント取得を次回再試行するための復旧を受け持つ。 */
export async function generateSkillSheetPdfBlob(input: SkillSheetPDFProps): Promise<Blob> {
  let resetFontsOnFailure: (() => void) | undefined;
  try {
    const [{ pdf }, { createSkillSheetPdf, resetPdfFontsAfterFailure }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/components/pdf-export'),
    ]);
    resetFontsOnFailure = resetPdfFontsAfterFailure;
    const document = await createSkillSheetPdf(input);
    return await pdf(document).toBlob();
  } catch (error) {
    // reject済みのフォント取得Promiseを破棄する。catch内で再importして復旧を遅らせない。
    resetFontsOnFailure?.();
    throw error;
  }
}
