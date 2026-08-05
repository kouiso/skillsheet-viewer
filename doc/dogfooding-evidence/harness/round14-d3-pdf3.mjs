// D-3 の詰め: 「カードのタイトル位置 → 次のカードのタイトル位置」の範囲に、
// 次ページのヘッダー/フッターが混ざって誤検出していないかを確かめる。
// 各ページ先頭・末尾の数アイテムを出して、ページ共通の装飾があるかを見る。
import { readFileSync } from 'node:fs';

const OUT = '<REPO>/test-results/dogfooding/round14';
const pdfjs = await import(
  '<SCRATCH>/pdftool/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`${OUT}/D-3.pdf`)), useSystemFonts: true })
  .promise;

for (const i of [3, 4, 5, 12, 13]) {
  const tc = await (await doc.getPage(i)).getTextContent();
  const strs = tc.items.map((x) => x.str).filter((s) => s.trim());
  console.log(`--- page ${i} 先頭5: ${JSON.stringify(strs.slice(0, 5))}`);
  console.log(`    page ${i} 末尾3: ${JSON.stringify(strs.slice(-3))}`);
}
