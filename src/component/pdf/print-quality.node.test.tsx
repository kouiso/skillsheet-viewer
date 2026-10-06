/**
 * 品質検査の自己診断。製品 PDF が改善しても検出力を失わないよう、
 * 意図的に小さな文字を置いた独立合成 PDF を検査する。
 */
import { Document, Font, Page, renderToBuffer, Text } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import PDF_FONT_FAMILY from './constant';
import { DEFAULT_QUALITY_OPTIONS, type QualityItem, type QualityPage, runQualityChecks } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';
import { REGULAR_TTF } from './test-font-path';

describe('品質検査が意図的な欠陥 PDF を検出する', () => {
  beforeAll(() => {
    Font.register({ family: PDF_FONT_FAMILY, src: REGULAR_TTF });
  });
  it('独立した 9.5pt の合成 PDF を不合格にする', async () => {
    const buffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={{ padding: 44, fontFamily: PDF_FONT_FAMILY }}>
          <Text style={{ fontSize: 14 }}>品質検査の自己診断</Text>
          <Text style={{ fontSize: 9.5 }}>意図的に小さな本文</Text>
        </Page>
      </Document>,
    );
    const pages = await extractQualityPages(buffer);
    const findings = runQualityChecks(
      { pages, headings: ['品質検査の自己診断'], requiredTexts: [] },
      DEFAULT_QUALITY_OPTIONS,
    );
    expect(findings.some((finding) => finding.check === 'font-too-small')).toBe(true);
  }, 30_000);
});

describe('sparse-page: 意図した空白ページの例外（company-grouping 作業）', () => {
  // 実レイアウトを描かず、pdfjs が返す座標配列を直接組み立てる（純関数なので描画不要）。
  const item = (text: string, y: number): QualityItem => ({ text, size: 11, x: 40, y, width: text.length * 5.5 });
  // 版面（800→46）の下の方まで本文が届いていることを示す行。これが無いページは面積の
  // 検査（underfilled-page）に掛かり、文字数の検査へ進む前に指摘される。
  const filler = item('版面の下まで本文が届いていることを示す行', 200);

  it('見出しだけの薄いページは、次ページも見出しから始まるなら除外する', () => {
    // p1: 会社見出し + 短い概要だけ（案件カードが丸ごと次ページへ送られた形）。
    // p2: 次の見出し（送られたカードの先頭）。p3: 最終ページ除外を避けるためのダミー。
    const pages: QualityPage[] = [
      [item('B社見出し', 800), item('概要文', 780), filler],
      [item('マッチングアプリの開発', 800), filler],
      [item('本文がここに来る想定のダミーページ', 800), filler],
    ];
    const findings = runQualityChecks(
      { pages, headings: ['B社見出し', 'マッチングアプリの開発'], requiredTexts: [] },
      DEFAULT_QUALITY_OPTIONS,
    );
    expect(findings.filter((f) => f.check === 'sparse-page' && f.page === 1)).toEqual([]);
  });

  it('薄いページの次が見出しでなければ、従来どおり sparse-page として検出する', () => {
    // p1 が薄く、p2 は「見出しではない、千切れた本文の続き」——本物の欠落の形。
    const pages: QualityPage[] = [
      [item('会員基盤リプレイス', 800), item('少しだけ本文。', 780), filler],
      [item('と続くはずの本文がここで千切れて消えている状態を再現する', 800), filler],
      [item('本文がここに来る想定のダミーページ', 800), filler],
    ];
    const findings = runQualityChecks(
      { pages, headings: ['会員基盤リプレイス'], requiredTexts: [] },
      DEFAULT_QUALITY_OPTIONS,
    );
    expect(findings.some((f) => f.check === 'sparse-page' && f.page === 1)).toBe(true);
  });

  it('見出しだけで版面がほぼ白いページは、例外に当たっても underfilled-page で拾う', () => {
    // 実データの p42 と同じ形（会社見出し + 概要のみ、版面の 11% しか使っていない）。
    // sparse-page の例外条件（自分も次も見出しから始まる）に完全に一致するため、
    // 文字数の検査だけでは永久に拾えなかった。面積の検査がここを塞ぐ。
    const pages: QualityPage[] = [
      [item('B社見出し', 800), item('概要文', 780)],
      [item('マッチングアプリの開発', 800), filler],
      [item('本文がここに来る想定のダミーページ', 800), filler],
    ];
    const findings = runQualityChecks(
      { pages, headings: ['B社見出し', 'マッチングアプリの開発'], requiredTexts: [] },
      DEFAULT_QUALITY_OPTIONS,
    );
    expect(findings.filter((f) => f.check === 'underfilled-page' && f.page === 1)).toHaveLength(1);
    // 面積で指摘したページを文字数でも二重に指摘しない。
    expect(findings.filter((f) => f.check === 'sparse-page' && f.page === 1)).toEqual([]);
  });
});

describe('underfilled-page: 強制改ページの跡（検査 11）', () => {
  const item = (text: string, y: number): QualityItem => ({ text, size: 11, x: 40, y, width: text.length * 5.5 });
  /** 次ページの上端に出る継続見出し（絶対配置なので本文上端 800pt より上）。 */
  const continuation = (title: string): QualityItem => ({
    text: `${title}（続き）`,
    size: 11,
    x: 40,
    y: 813,
    width: 200,
  });

  it('同じカードが続くのに下端が大きく空いていれば拾う', () => {
    // 実データ p51 と同じ形（下に 134pt ＝ 約 7 行空いたままコメントを次ページへ送った）。
    const pages: QualityPage[] = [
      [item('案件Aの本文', 800), item('ここで途切れる', 180)],
      [continuation('案件A'), item('コメントの続き', 780), item('末尾', 100)],
      [item('次の見出し', 800), item('末尾', 100)],
    ];
    const findings = runQualityChecks({ pages, headings: ['案件A', '次の見出し'], requiredTexts: [] });
    expect(findings.filter((f) => f.check === 'underfilled-page' && f.page === 1)).toHaveLength(1);
  });

  it('入り切らない塊を送っただけの空き（100pt 以下）は拾わない', () => {
    const pages: QualityPage[] = [
      [item('案件Aの本文', 800), item('ここで途切れる', 130)],
      [continuation('案件A'), item('続き', 780), item('末尾', 100)],
      [item('次の見出し', 800), item('末尾', 100)],
    ];
    const findings = runQualityChecks({ pages, headings: ['案件A', '次の見出し'], requiredTexts: [] });
    expect(findings.filter((f) => f.check === 'underfilled-page')).toEqual([]);
  });

  it('カードを丸ごと送った後のページは、版面の 4 割を使っていれば拾わない', () => {
    // 「途中で切れるより丸ごと送る」はオーナーの指示。空白そのものは許す。
    // y=498 は (800-498)/754 ≒ 40.05%。閾値 0.4 のすぐ上に置いて、閾値が黙って
    // 上がった時にこのテストが落ちるようにする。
    const pages: QualityPage[] = [
      [item('会社見出し', 800), item('ここで終わる', 498)],
      [item('次の案件', 800), item('末尾', 100)],
      [item('最終ページ', 800), item('末尾', 100)],
    ];
    const findings = runQualityChecks({ pages, headings: ['会社見出し', '次の案件', '最終ページ'], requiredTexts: [] });
    expect(findings.filter((f) => f.check === 'underfilled-page')).toEqual([]);
  });

  it('カードを丸ごと送った後でも、版面の 4 割を切るページは拾う', () => {
    // y=499 は (800-499)/754 ≒ 39.9%。上のテストと 1pt 違いで境界を挟む。
    const pages: QualityPage[] = [
      [item('会社見出し', 800), item('ここで終わる', 499)],
      [item('次の案件', 800), item('末尾', 100)],
      [item('最終ページ', 800), item('末尾', 100)],
    ];
    const findings = runQualityChecks({ pages, headings: ['会社見出し', '次の案件', '最終ページ'], requiredTexts: [] });
    expect(findings.filter((f) => f.check === 'underfilled-page').map((f) => f.page)).toEqual([1]);
  });

  it('最終ページは本文が尽きて短くなるので拾わない', () => {
    const pages: QualityPage[] = [
      [item('会社見出し', 800), item('末尾', 100)],
      [item('最終ページ', 800), item('少しだけ', 780)],
    ];
    const findings = runQualityChecks({ pages, headings: ['会社見出し', '最終ページ'], requiredTexts: [] });
    expect(findings.filter((f) => f.check === 'underfilled-page')).toEqual([]);
  });
});

describe('orphan-list-marker: 箇条書きの記号だけが残る（検査 12）', () => {
  const item = (text: string, y: number): QualityItem => ({ text, size: 11, x: 40, y, width: text.length * 5.5 });

  it('ページ最下段に記号だけが残っていれば拾う', () => {
    const pages: QualityPage[] = [
      [item('本文', 800), item('—', 100)],
      [item('次の見出し', 800), item('末尾', 100)],
    ];
    const findings = runQualityChecks({ pages, headings: ['本文', '次の見出し'], requiredTexts: [] });
    expect(findings.filter((f) => f.check === 'orphan-list-marker' && f.page === 1)).toHaveLength(1);
  });
});
