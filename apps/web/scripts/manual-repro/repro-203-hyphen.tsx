/**
 * Issue #203 の再検証スクリプト（DB上の実データに対して手動で再実行するためのツール。
 * DATABASE_URL が要るため通常のテストスイートには含めない）。
 *
 * 報告: PDF の日本語に原文に無いハイフンが入る（#146 の再発）。
 * 実測で確認した原因: splitForHyphenation() 自体は CJK 文字の前後に BREAK_MARKER を
 * 正しく挟んでいる。しかし react-pdf が長文段落をページ／行の境界で再分割(reflow)する
 * 際、この BREAK_MARKER が境界のどちら側に残るかが揃わないケースがあり、和文の句点
 * （。）の直後に「本物の」次のシラブルが来て @react-pdf/textkit 側の hyphenated 判定が
 * true になってしまっていた（patches/@react-pdf__textkit@6.3.0.patch で修正）。
 *
 * 使い方:
 *   DATABASE_URL=... pnpm --filter @skillsheet/web exec tsx scripts/manual-repro/repro-203-hyphen.tsx <sheetId>
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getSkillSheetById } from '@skillsheet/db';
import React from 'react';

// tsx(esbuild) の classic JSX トランスフォームが React.createElement をグローバル参照として
// 埋め込むため（apps/web の tsconfig は jsx:"preserve" で Next.js の SWC 変換前提だが、
// このスクリプトは tsx で直接実行するので明示的にグローバルへ生やす）。
(globalThis as unknown as { React: typeof React }).React = React;

import { Font, renderToBuffer } from '@react-pdf/renderer';

import PDF_FONT_FAMILY from '../../src/components/pdf/constants';
import { splitForHyphenation } from '../../src/components/pdf/fonts';
import { SkillSheetDocument } from '../../src/components/pdf/skill-sheet-document';

async function extractPdfText(buffer: Buffer): Promise<{ pageCount: number; text: string }> {
  const { getDocument } = await import('pdfjs-dist');
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item && typeof item.str === 'string') text += item.str;
    }
  }
  return { pageCount: doc.numPages, text };
}

async function main() {
  const sheetId = process.argv[2];
  if (!sheetId) throw new Error('usage: repro-203-hyphen.tsx <sheetId>');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const sheet = await getSkillSheetById(sheetId);
  console.log(
    `[repro-203] sheet="${sheet.title}" blocks=${sheet.blocks.length} content.length=${sheet.content.length}`,
  );

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
  const { pageCount, text } = await extractPdfText(buffer);
  console.log(`[repro-203] page count = ${pageCount}, extracted text length = ${text.length}`);

  const tofu = (text.match(/�/g) ?? []).length;
  console.log(`[repro-203] tofu(replacement char) count = ${tofu}`);

  const cjkOrPunct = /[぀-ヿ㐀-鿿豈-﫿、。]/u;
  const hits: string[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (cjkOrPunct.test(text[i]) && text[i + 1] === '-') {
      hits.push(text.slice(Math.max(0, i - 10), i + 12));
    }
  }
  console.log(`[repro-203] 和文（句読点含む）直後にハイフンが来る箇所 = ${hits.length}`);
  for (const h of hits.slice(0, 20)) console.log('  ...', JSON.stringify(h), '...');

  process.exit(hits.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
