/**
 * PDF のバイト列から、品質検査に必要な 1 文字単位の座標を取り出す。
 *
 * `pdfjs-dist` を import するため **Node 環境専用**（`*.node.test.tsx` からのみ使う）。
 * jsdom では @react-pdf の描画も pdfjs も別 realm の Uint8Array 判定で壊れる
 * （CLAUDE.md の取り決め）。ファイル名の `.node.` はその境界を人が読める形で示すもの。
 */

import type { QualityPage } from './print-quality';

/** pdfjs の item は type が緩いので、必要なフィールドだけを型で絞る。 */
interface RawTextItem {
  str?: string;
  width?: number;
  transform?: number[];
}

export async function extractQualityPages(buffer: Buffer | Uint8Array): Promise<QualityPage[]> {
  const { getDocument } = await import('pdfjs-dist');
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: QualityPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const items: QualityPage = [];
    for (const raw of content.items as RawTextItem[]) {
      const text = typeof raw.str === 'string' ? raw.str : '';
      if (text.trim() === '') continue;
      const transform = raw.transform ?? [0, 0, 0, 0, 0, 0];
      items.push({ text, size: transform[0], x: transform[4], y: transform[5], width: raw.width ?? 0 });
    }
    pages.push(items);
  }
  return pages;
}
