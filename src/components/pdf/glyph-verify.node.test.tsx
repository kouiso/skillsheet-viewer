import { existsSync } from 'node:fs';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { getDocument, OPS } from 'pdfjs-dist';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { countEmbeddedFontFiles, extractEmbeddedTrueTypeFonts, inspectEmbeddedFont } from './embedded-font';
import { SkillSheetDocument } from './skill-sheet-document';
import { BOLD_TTF, REGULAR_TTF } from './test-font-paths';

// サブセットに含まれる「輪郭を持たないグリフ」は半角スペース程度しか出ない。
// 本文の長さに依存しない不変条件にするため、絶対数ではなくこの余裕で見る。
const ALLOWED_EMPTY_GLYPHS = 2;

// PDF の text rendering mode 3 は「文字を描かない（不可視テキスト）」。
// 字形が正しく埋まっていても、これが立っていると画面には何も出ない。
const TEXT_RENDERING_MODE_INVISIBLE = 3;

// 本文から和文（ひらがな・カタカナ・CJK統合漢字）の字種を数える。閾値を本文から
// 導くことで、本文を書き換えたときに嘘の下限が残らないようにする。
function distinctJapaneseCodePoints(text: string): Set<string> {
  const found = new Set<string>();
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const isKana = code >= 0x3040 && code <= 0x30ff;
    const isIdeograph = code >= 0x4e00 && code <= 0x9fff;
    if (isKana || isIdeograph) found.add(character);
  }
  return found;
}

const CONTENT = [
  '## 概要',
  '',
  'フルスタックエンジニアとして、日本語のスキルシートを **PDF** に変換します。',
  '',
  '## 職務経歴',
  '',
  '### ■ 株式会社テスト — 決済システム開発',
  '',
  '大規模Webアプリケーションの設計・開発を担当しました。',
  '',
  '- 要件定義から運用までを一貫して担当',
  '- パフォーマンス改善で表示速度を 30% 改善',
].join('\n');

describe('PDF glyph rendering verify', () => {
  beforeAll(() => {
    expect(existsSync(REGULAR_TTF)).toBe(true);
    expect(existsSync(BOLD_TTF)).toBe(true);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
        { src: REGULAR_TTF, fontWeight: 400, fontStyle: 'italic' },
        { src: BOLD_TTF, fontWeight: 700, fontStyle: 'italic' },
      ],
    });
  });

  // #176 が観測した壊れ方は CFF（/FontFile3・CIDFontType0）側で、ここで見ているのは
  // TrueType（/FontFile2）。つまりこのテストは「#176 そのものの再発検知」ではなく、
  // TTF 前提が維持されていること と 埋め込みサブセットが健全であることを守るもの。
  // CFF に戻すと取り出しが 0 件になるので、その差し戻し自体はここで落ちる。
  it('埋め込んだ全サブセットが字形を引ける形になっている', { timeout: 60_000 }, async () => {
    const buffer = await renderToBuffer(<SkillSheetDocument title="日本語グリフ検証" content={CONTENT} />);

    // ラスタライズ（pdftoppm 等）を挟まないのは、PATH 上の外部バイナリに依存すると
    // 環境によって黙って検証が飛ぶため。代わりに埋め込みサブセットを直接読む。
    // 和文が別のフォントへ逃げる経路が無いことを先に固定する。CFF(/FontFile3) や
    // Type1(/FontFile) が 1 本でも混ざっていれば、以降の TrueType 側の検査だけでは
    // 「和文はそちらで描かれている」可能性を排除できない。
    const kinds = countEmbeddedFontFiles(buffer);
    expect(kinds.cff).toBe(0);
    expect(kinds.type1).toBe(0);
    expect(kinds.trueType).toBeGreaterThan(0);

    const fonts = extractEmbeddedTrueTypeFonts(buffer);
    expect(fonts).toHaveLength(kinds.trueType);

    const reports = fonts.map((font) => inspectEmbeddedFont(font));

    // Regular / Bold など複数サブセットが埋まるので、1 つでも死んでいれば落とす
    // （最大値で見ると、Bold が丸ごと描画不能でも緑になってしまう）。
    for (const report of reports) {
      expect(report.numGlyphs).toBeGreaterThan(0);
      // loca が壊れると全ての字形オフセットが破綻し、テキスト抽出は正常なまま
      // 一文字も描画されない状態になる。
      expect(report.locaCountMatchesNumGlyphs).toBe(true);
      expect(report.offsetsMonotonic).toBe(true);
      expect(report.lastOffsetWithinGlyf).toBe(true);
      expect(report.nonEmptyGlyphCount).toBeGreaterThanOrEqual(report.numGlyphs - ALLOWED_EMPTY_GLYPHS);
    }

    // 本文の和文字種は、少なくとも 1 つのサブセットに入っていなければならない。
    // 逃げ道が無いことと合わせて、和文がサブセット化から漏れていないことを見る。
    const japanese = distinctJapaneseCodePoints(CONTENT);
    const totalGlyphs = reports.reduce((sum, report) => sum + report.numGlyphs, 0);
    expect(totalGlyphs).toBeGreaterThanOrEqual(japanese.size);
  });

  it('本文の和文がテキスト層から抜け落ちていない', { timeout: 60_000 }, async () => {
    const buffer = await renderToBuffer(<SkillSheetDocument title="日本語グリフ検証" content={CONTENT} />);
    const document = await getDocument({ data: new Uint8Array(buffer) }).promise;

    let extracted = '';
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      extracted += content.items.map((item) => ('str' in item ? item.str : '')).join('');
    }

    // 字形の健全性だけ見ていると「そもそも本文が入っていない PDF」を素通りさせる。
    for (const character of distinctJapaneseCodePoints(CONTENT)) {
      expect(extracted).toContain(character);
    }
  });

  it('本文が不可視テキストとして描かれていない', { timeout: 60_000 }, async () => {
    const buffer = await renderToBuffer(<SkillSheetDocument title="日本語グリフ検証" content={CONTENT} />);
    const document = await getDocument({ data: new Uint8Array(buffer) }).promise;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const { fnArray, argsArray } = await page.getOperatorList();
      const invisible = fnArray
        .map((fn, index) => (fn === OPS.setTextRenderingMode ? argsArray[index][0] : null))
        .filter((mode) => mode === TEXT_RENDERING_MODE_INVISIBLE);

      expect(invisible).toHaveLength(0);
    }
  });
});
