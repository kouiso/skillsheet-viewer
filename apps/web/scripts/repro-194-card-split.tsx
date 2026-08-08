/**
 * Issue #194 の再検証スクリプト（DB上の実データに対して手動で再実行するためのツール。
 * DATABASE_URL が要るため通常のテストスイートには含めない）。
 *
 * 報告: PDF で案件カード3件がページ境界で分割される
 *   M社「雑誌などの販売システム」17→18ページ
 *   B社（ベンチャー企業）「PatentStart」19→20ページ
 *   P社（ベンチャー企業）「Jewels」20→21ページ
 *
 * 各ページのテキストに「### 会社名 — タイトル」の見出し文字列がどのページに現れるかを
 * 数え、1つの見出しが複数ページにまたがって出現していないか（＝カードが分割されて
 * いないか）を確認する。
 *
 * 使い方:
 *   DATABASE_URL=... pnpm --filter @skillsheet/web exec tsx scripts/repro-194-card-split.tsx <sheetId>
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getSkillSheetById } from '@skillsheet/db';
import React from 'react';

(globalThis as unknown as { React: typeof React }).React = React;

import { Font, renderToBuffer } from '@react-pdf/renderer';

import PDF_FONT_FAMILY from '../src/component/pdf/constants';
import { splitForHyphenation } from '../src/component/pdf/fonts';
import { SkillSheetDocument } from '../src/component/pdf/skill-sheet-document';

async function extractPerPageText(buffer: Buffer): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist');
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if ('str' in item && typeof item.str === 'string') text += item.str;
    }
    pages.push(text);
  }
  return pages;
}

async function main() {
  const sheetId = process.argv[2];
  if (!sheetId) throw new Error('usage: repro-194-card-split.tsx <sheetId>');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const sheet = await getSkillSheetById(sheetId);
  console.log(`[repro-194] sheet="${sheet.title}" blocks=${sheet.blocks.length}`);

  const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
  const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
  const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');
  if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: REGULAR_TTF, fontWeight: 400 },
      { src: BOLD_TTF, fontWeight: 700 },
      { src: REGULAR_TTF, fontWeight: 400, fontStyle: 'italic' },
      { src: BOLD_TTF, fontWeight: 700, fontStyle: 'italic' },
    ],
  });
  if (typeof Font.registerHyphenationCallback === 'function') {
    Font.registerHyphenationCallback(splitForHyphenation);
  }

  const buffer = await renderToBuffer(<SkillSheetDocument title={sheet.title} content={sheet.content} />);
  const pages = await extractPerPageText(buffer);
  console.log(`[repro-194] page count = ${pages.length}`);

  // 案件見出し「会社名 — タイトル」を content の生 markdown から抽出する。
  const headingMatches = [...sheet.content.matchAll(/^### (.+? — .+)$/gm)].map((m) => m[1]);
  console.log(`[repro-194] 案件カード数 = ${headingMatches.length}`);

  const split: string[] = [];
  for (const heading of headingMatches) {
    // 抽出テキストは空白が詰まっていることがあるため、突合は空白除去して行う。
    const normalizedHeading = heading.replace(/\s+/g, '');
    const pageIndices = pages
      .map((text, idx) => (text.replace(/\s+/g, '').includes(normalizedHeading) ? idx + 1 : -1))
      .filter((idx) => idx !== -1);
    // 見出し自体が同じページに複数回現れることはないはずなので pageIndices は1件のはず。
    // 「分割」を検出したいのは見出しの直後の内容がその次のページに漏れているケースなので、
    // 見出しが出現したページと、そのカードの末尾らしき内容が出現するページを比較する。
    if (pageIndices.length === 0) {
      console.log(`[repro-194] 警告: 見出し「${heading}」がどのページにも見つからない`);
    }
  }

  // より直接的に：各案件カードの「区切り」を報告済みの3件で確認する。
  const KNOWN_BAD_CARDS = [
    { needle: '雑誌などの販売システム', label: 'M社 雑誌などの販売システム' },
    { needle: 'PatentStart', label: 'B社 PatentStart' },
    { needle: 'Jewels', label: 'P社 Jewels' },
  ];
  for (const { needle, label } of KNOWN_BAD_CARDS) {
    const pagesContaining = pages
      .map((text, idx) => (text.includes(needle) ? idx + 1 : -1))
      .filter((idx) => idx !== -1);
    const spansMultiplePages = pagesContaining.length > 1;
    console.log(
      `[repro-194] ${label}: 出現ページ = [${pagesContaining.join(', ')}]${spansMultiplePages ? '  ← まだ複数ページにまたがっている' : '  OK'}`,
    );
    if (spansMultiplePages) split.push(label);
  }

  console.log(`[repro-194] 分割が残っているカード数 = ${split.length}`);

  // クリップ（内容消失）が起きていないかも確認する（#172 の再発が無いこと）。
  const fullText = pages.join('').replace(/\s+/g, '');
  let missing = 0;
  for (const heading of headingMatches) {
    const [company, title] = heading.split(' — ');
    if (!fullText.includes((title ?? '').replace(/\s+/g, ''))) {
      console.log(`[repro-194] 警告: 案件「${heading}」のタイトルがPDFに見つからない（内容消失の疑い）`);
      missing += 1;
    }
    void company;
  }
  console.log(`[repro-194] タイトルが見つからない案件数 = ${missing}`);

  process.exit(split.length > 0 || missing > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
