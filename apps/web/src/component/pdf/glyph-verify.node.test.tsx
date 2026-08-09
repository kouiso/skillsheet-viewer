import { existsSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { getDocument, OPS } from 'pdfjs-dist';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { extractEmbeddedTrueTypeFonts, inspectEmbeddedFont } from './embedded-font';
import { SkillSheetDocument } from './skill-sheet-document';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

// サブセットに含まれる「輪郭を持たないグリフ」は半角スペース程度しか出ない。
// 本文の長さに依存しない不変条件にするため、絶対数ではなくこの余裕で見る。
const ALLOWED_EMPTY_GLYPHS = 2;

// 和文本文が載る側のサブセットが持つべきグリフ数の下限。和文がフォールバックで
// 別フォントへ逃げた場合に気付くためだけの、字種より十分小さい値。
const MINIMUM_JAPANESE_GLYPHS = 20;

// PDF の text rendering mode 3 は「文字を描かない（不可視テキスト）」。
// 字形が正しく埋まっていても、これが立っていると画面には何も出ない。
const TEXT_RENDERING_MODE_INVISIBLE = 3;

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
    const fonts = extractEmbeddedTrueTypeFonts(buffer);
    expect(fonts.length).toBeGreaterThan(0);

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

    // 和文が別フォントへ逃げていないこと。
    expect(Math.max(...reports.map((report) => report.numGlyphs))).toBeGreaterThanOrEqual(MINIMUM_JAPANESE_GLYPHS);
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
