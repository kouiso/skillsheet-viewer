import { rendersProjectCards } from '@/component/pdf/print-view-model';
import type { SkillSheetPDFProps } from '@/component/pdf-export';
import { filterVisibleProjectData } from '@/db/block';
import { resolveDuration } from '@/db/duration';

export class PdfDurationConflictError extends Error {
  constructor() {
    super('終了済み案件の期間と参画期間が一致しません。原文の差分を確認してからPDFを出力してください。');
    this.name = 'PdfDurationConflictError';
  }
}

/** PDF生成と、失敗したフォント取得を次回再試行するための復旧を受け持つ。 */
export async function generateSkillSheetPdfBlob(input: SkillSheetPDFProps): Promise<Blob> {
  // 要約版は views を無視して全案件を描くので、edition で判定する。
  // 'projects' だけ見ると timeline-only 出力でゲートが素通りになるため、
  // 描画側と同じ rendersProjectCards で判定する（#354）。
  const rendersProjects = input.edition === 'digest' || rendersProjectCards(input.views);
  if (input.blocks && rendersProjects) {
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
      import('@/component/pdf-export'),
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
