/**
 * Issue #194 の再検証スクリプト（DB上の実データに対して手動で再実行するためのツール。
 * DATABASE_URL が要るため通常のテストスイートには含めない）。
 *
 * 報告: PDF で案件カード3件がページ境界で分割される
 *   M社「雑誌などの販売システム」17→18ページ
 *   B社（ベンチャー企業）「士業向けマッチングアプリ」19→20ページ
 *   P社（ベンチャー企業）「小売業のお問い合わせフォーム」20→21ページ
 *
 * 各ページのテキストに「### 会社名 — タイトル」の見出し文字列がどのページに現れるかを
 * 数え、1つの見出しが複数ページにまたがって出現していないか（＝カードが分割されて
 * いないか）を確認する。
 *
 * 使い方:
 *   DATABASE_URL=... pnpm exec tsx scripts/manual-repro/repro-194-card-split.tsx <sheetId>
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { getSkillSheetById } from '@/db';

(globalThis as unknown as { React: typeof React }).React = React;

import { Font, renderToBuffer } from '@react-pdf/renderer';

import PDF_FONT_FAMILY from '../../src/components/pdf/constants';
import { splitForHyphenation } from '../../src/components/pdf/fonts';
import { SkillSheetDocument } from '../../src/components/pdf/skill-sheet-document';

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

  // 案件見出し「会社名 — タイトル」を content の生 markdown から、出現位置(index)付きで抽出する。
  const headingMatches = [...sheet.content.matchAll(/^### (.+? — .+)$/gm)].map((m) => ({
    heading: m[1],
    index: m.index ?? 0,
  }));
  console.log(`[repro-194] 案件カード数 = ${headingMatches.length}`);

  // 抽出テキストは空白が詰まっていることがあるため、突合は空白除去して行う。
  // fromPage 以降だけを検索する（既定は先頭から）。テンプレ由来の定型文等で末尾段落と
  // 同じ文言が別カードにも存在すると、全ページ検索では見出しより前のページを誤検出し、
  // 分割していないカードを「分割されている」と誤判定する（CodeRabbit レビュー指摘）。
  const findFirstPage = (needle: string, fromPage = 0): number => {
    const normalized = needle.replace(/\s+/g, '');
    if (!normalized) return -1;
    const offset = pages.slice(fromPage).findIndex((text) => text.replace(/\s+/g, '').includes(normalized));
    return offset === -1 ? -1 : fromPage + offset;
  };

  // カード本文（見出し〜次の見出しの直前）の末尾にある、見出し・表以外の意味のある行
  // （会社概要文/業務内容/習得スキル等の段落）を1行取り出す。これが見出しと別ページに
  // 出ていれば、そのカードはページ境界で分割されている。
  const lastMeaningfulLine = (cardBody: string): string | null => {
    const lines = cardBody.split('\n').map((l) => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (!l || l.startsWith('#') || l.startsWith('|') || /^:?-+:?$/.test(l)) continue;
      if (l.length < 8) continue; // 短すぎる行は他ページとの偶然一致リスクが高いので避ける
      return l;
    }
    return null;
  };

  // 見出しが出現したページと、そのカードの末尾らしき内容が出現するページを比較する
  // （旧実装は見出し文字列自体が複数ページにまたがるかしか見ておらず、#194 の実際の症状
  // 「見出し+表は1ページ目・末尾の段落だけ次ページに漏れる」を検出できていなかった。
  // chatgpt-codex-connector レビュー指摘）。
  const split: string[] = [];
  for (let i = 0; i < headingMatches.length; i++) {
    const { heading, index } = headingMatches[i];
    const nextIndex = headingMatches[i + 1]?.index ?? sheet.content.length;
    const cardBody = sheet.content.slice(index, nextIndex);
    const headingPage = findFirstPage(heading);
    if (headingPage === -1) {
      console.log(`[repro-194] 警告: 見出し「${heading}」がどのページにも見つからない`);
      continue;
    }
    const tailLine = lastMeaningfulLine(cardBody);
    if (!tailLine) {
      console.log(`[repro-194] 警告: 「${heading}」の末尾段落を content から特定できず判定不能`);
      continue;
    }
    // 末尾段落は見出しより前のページには出ない。前方の同一文言との誤一致を避ける。
    const tailPage = findFirstPage(tailLine, headingPage);
    if (tailPage === -1) {
      console.log(`[repro-194] 警告: 「${heading}」の末尾段落「${tailLine}」がPDF上に見つからない`);
      continue;
    }
    if (tailPage !== headingPage) {
      console.log(
        `[repro-194] ${heading}: 見出し=${headingPage + 1}ページ / 末尾段落=${tailPage + 1}ページ  ← ページ境界で分割されている`,
      );
      split.push(heading);
    }
  }

  console.log(`[repro-194] 分割が残っているカード数 = ${split.length}`);

  // クリップ（内容消失）が起きていないかも確認する（#172 の再発が無いこと）。
  const fullText = pages.join('').replace(/\s+/g, '');
  let missing = 0;
  for (const { heading } of headingMatches) {
    const title = heading.split(' — ')[1];
    if (!fullText.includes((title ?? '').replace(/\s+/g, ''))) {
      console.log(`[repro-194] 警告: 案件「${heading}」のタイトルがPDFに見つからない（内容消失の疑い）`);
      missing += 1;
    }
  }
  console.log(`[repro-194] タイトルが見つからない案件数 = ${missing}`);

  process.exit(split.length > 0 || missing > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
