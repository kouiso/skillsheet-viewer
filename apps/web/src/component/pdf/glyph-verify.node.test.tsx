import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { SkillSheetDocument } from './skill-sheet-document';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

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

  it('renders PDF with Japanese glyphs visible', { timeout: 60_000 }, async () => {
    const content = [
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

    const element = <SkillSheetDocument title="日本語グリフ検証" content={content} />;
    const buffer = await renderToBuffer(element);
    const pdfPath = '/tmp/glyph-check.pdf';
    writeFileSync(pdfPath, buffer);

    execFileSync('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', pdfPath, '/tmp/glyph-check']);
    const pngPath = '/tmp/glyph-check-1.png';
    expect(existsSync(pngPath)).toBe(true);
    const png = readFileSync(pngPath);
    expect(png.length).toBeGreaterThan(0);
    console.log('PNG saved to', pngPath, 'size:', png.length);
  });
});
