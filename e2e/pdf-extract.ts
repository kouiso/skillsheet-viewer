import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist';

// PDF のテキストを assertion 用に取り出す小さな共有ヘルパー。auth.ts と同じ立て付け
// （非 .spec ファイル・複数の spec から import される）。pdf-glyph.spec.ts が既に
// 同じロジックをファイル内に直書きしていたが、ページ単位のテキストが必要な検証
// （継続見出しがどのページに乗っているか等）が増えたため、ページ配列を返す版を
// ここに寄せる。文字列連結版（extractPdfText）は既存の使い方に合わせて残す。

/** PDF の各ページのテキストを、ページ順の配列で返す（1-indexed ではなく 0-indexed の配列）。 */
export async function extractPdfPages(filePath: string): Promise<string[]> {
  const buffer = await fs.readFile(filePath);
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(''));
  }
  return pages;
}

/** PDF 全ページのテキストを連結して返す（ページ境界を気にしない検証用）。 */
export async function extractPdfText(filePath: string): Promise<string> {
  const pages = await extractPdfPages(filePath);
  return pages.join('');
}
