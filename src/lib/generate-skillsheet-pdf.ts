import type { SkillSheetPDFProps } from '@/components/pdf-export';
import { filterVisibleProjectData } from '@/db/blocks';
import { resolveDuration } from '@/db/duration';

export class PdfDurationConflictError extends Error {
  constructor() {
    super('終了済み案件の期間と参画期間が一致しません。原文の差分を確認してからPDFを出力してください。');
    this.name = 'PdfDurationConflictError';
  }
}

/** PDF生成と、失敗したフォント取得を次回再試行するための復旧を受け持つ。 */
export async function generateSkillSheetPdfBlob(input: SkillSheetPDFProps): Promise<Blob> {
  if (input.blocks && (input.views === undefined || input.views.includes('projects'))) {
    if (!Number.isSafeInteger(input.referenceMonth) || (input.referenceMonth ?? -1) < 0) {
      throw new Error('INVALID_REFERENCE_MONTH');
    }
    const conflict = input.blocks.some(
      (block) =>
        block.type === 'project' &&
        filterVisibleProjectData(block.data).items.some(
          (item) => resolveDuration(item.period, item.duration, input.referenceMonth).conflict,
        ),
    );
    if (conflict) throw new PdfDurationConflictError();
  }
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
