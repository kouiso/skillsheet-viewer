import type { LineBreakCheckOptions } from './line-break-quality';
import type { PrintPage } from './print-paginate';
import { PRINT_SIZE } from './print-token';

/** Project pages are the final explicit pages of the document. Their measured
 * leaves use the same frame and width as rendering; automatic summary/skills
 * pages are excluded. No career text or coordinates need to be persisted. */
export function displayParagraphRegions(
  pages: PrintPage[],
  totalPdfPages: number,
): NonNullable<LineBreakCheckOptions['displayParagraphRegions']> {
  // Invalid document/page correspondence cannot establish leaf ownership.
  if (!Number.isInteger(totalPdfPages) || totalPdfPages < pages.length) return [];
  const offset = totalPdfPages - pages.length;
  return pages.flatMap((page, index) =>
    page.leaves.flatMap(({ leaf, top }) =>
      leaf.displayParagraphGroup && leaf.displayParagraphText
        ? [
            {
              page: offset + index + 1,
              top: PRINT_SIZE.padTop + top,
              bottom: PRINT_SIZE.padTop + top + leaf.height,
              text: leaf.displayParagraphText,
            },
          ]
        : [],
    ),
  );
}
