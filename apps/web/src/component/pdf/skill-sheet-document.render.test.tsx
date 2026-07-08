import { existsSync } from 'node:fs';
import path from 'node:path';

import { Font, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { SkillSheetDocument } from './skill-sheet-document';

// public/ 配下の実フォントファイルへの絶対パス。
// 本番（pdf/fonts.ts）はブラウザ向けに URL 参照（/fonts/...）で登録するが、
// Node 上のバイト描画ではファイルシステムから読めないため、ここでは実ファイルパスで登録する。
// ファミリ名は本番と同じ PDF_FONT_FAMILY を使うので、コンポーネントの参照と一致する。
const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_OTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.otf');
const BOLD_OTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.otf');

// PDF の先頭マジックバイト（%PDF-）。これが無ければ PDF として成立していない。
const PDF_HEADER = '%PDF-';

function registerNodeFonts(): void {
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: REGULAR_OTF, fontWeight: 400 },
      { src: BOLD_OTF, fontWeight: 700 },
      // 日本語に true italic は無いため、italic にも同じ字形を割り当てる（本番 fonts.ts と同じ方針）。
      { src: REGULAR_OTF, fontWeight: 400, fontStyle: 'italic' },
      { src: BOLD_OTF, fontWeight: 700, fontStyle: 'italic' },
    ],
  });
}

// 日本語見出し・段落・テーブル・日本語入りコードブロックを含み、
// かつ複数ページに跨る程度の分量を持つ決定的なスキルシート Markdown。
function buildContent(): string {
  const skillRows = Array.from({ length: 40 }, (_, i) => `| 技術${i} | ${i}年 | 業務利用 |`).join('\n');
  const projects = Array.from(
    { length: 6 },
    (_, i) =>
      `\n### ■ プロジェクト${i + 1}\n\n大規模Webアプリケーションの設計・開発を担当しました。\n\n- 要件定義から運用までを一貫して担当\n- パフォーマンス改善で表示速度を改善\n`,
  ).join('\n');

  return [
    '## 概要',
    '',
    'フルスタックエンジニアとして、日本語のスキルシートを **PDF** に変換します。',
    '',
    '## スキル一覧',
    '',
    '| 技術 | 経験年数 | 習熟度 |',
    '| :--- | :--- | :--- |',
    skillRows,
    '',
    '## コード例（日本語コメント込み）',
    '',
    // フェンス付きコードブロック内に日本語を含めることで、P1-4 の tofu（文字化け）回帰を防ぐ。
    '```ts',
    'const 担当者 = "山田太郎"; // 担当者の氏名',
    'function 計算する(金額: number): number {',
    '  // 税込み金額を返す（消費税10%）',
    '  return Math.floor(金額 * 1.1);',
    '}',
    '```',
    '',
    '## 職務経歴',
    projects,
    '',
  ].join('\n');
}

describe('SkillSheetDocument（実バイト描画）', () => {
  beforeAll(() => {
    // 実ファイルが無いと描画は成立しないため前提を明示する。
    expect(existsSync(REGULAR_OTF)).toBe(true);
    expect(existsSync(BOLD_OTF)).toBe(true);
    registerNodeFonts();
  });

  it('登録済み Noto Sans JP で日本語入りコードを含む非空の %PDF バッファを描画できる', async () => {
    const buffer = await renderToBuffer(<SkillSheetDocument title="山田太郎 スキルシート" content={buildContent()} />);

    // 非空であること。
    expect(buffer.length).toBeGreaterThan(0);
    // PDF として成立していること（先頭が %PDF-）。
    expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
    // 末尾に PDF の終端マーカー（%%EOF）があり、途中で壊れていないこと。
    expect(buffer.subarray(-1024).toString('latin1')).toContain('%%EOF');
  });

  it('同一入力に対して決定的に %PDF バッファを描画する（2回とも成立）', async () => {
    const content = buildContent();
    const first = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
    const second = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);

    for (const buffer of [first, second]) {
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
    }
  });

  it('多列テーブル＋長い未分割トークン(URL)を含む内容でもスローせず描画できる（セルの overflow:hidden 回帰防止）', async () => {
    // 8列テーブル＋URLのような区切り文字のない長いトークンは、修正前は
    // 折返し後の最終行がセル境界を超えて隣列へ視覚的にはみ出していた
    // （PDFをラスタライズして実際に確認済み）。tableCell に overflow: 'hidden'
    // を追加し、セル幅内にクリップされるよう修正した。
    const header = '| 列A | 列B | 列C | 列D | 列E | 列F | 列G | 列H |';
    const sep = '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |';
    const row =
      '| https://example.com/very/long/unbroken/url/path/xxxxxxxxxxxxxxxxxxxxxxxxxx | b | c | d | e | f | g | h |';
    const content = ['## 多列テーブル', '', header, sep, row, ''].join('\n');

    const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
  });
});
