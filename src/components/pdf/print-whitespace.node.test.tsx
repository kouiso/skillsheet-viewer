/**
 * 紙面の空白を**面積で**測る検査（`underfilled-page` / `orphan-list-marker`）を、
 * 実際に描いた PDF に当てて確かめる。
 *
 * 既存の検査は「文字が壊れているか」しか見ていなかったため、本文を長文化しただけで出た
 * 崩れ（強制改ページで版面の 7 割が白、会社見出しだけのページ、ページ下端に箇条書きの
 * 記号だけが残る）を素通りさせた。ここは合成フィクスチャを CI のゲートにしつつ、
 * 手元では `QUALITY_PDF_PATH` に任意の PDF を渡して同じ検査を当てられるようにしてある
 * （実データの PDF はコミットできないので、証拠を取るときはこちらを使う）。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { buildPdfQualityFixtureBlocks, PDF_QUALITY_FIXTURE_TITLE } from './fixtures/print-quality-fixture';
import { splitForHyphenation } from './fonts';
import { PrintSkillSheetDocument } from './print-document';
import {
  continuesPreviousCard,
  DEFAULT_QUALITY_OPTIONS,
  findOrphanListMarker,
  measurePageFill,
  type QualityPage,
} from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

/**
 * 手元で任意の PDF（実データで出力したもの等）に同じ検査を当てるための入口。
 * 未設定を空文字に畳んでおく（`as string` を書かずに `skipIf` と両立させるため）。
 */
const QUALITY_PDF_PATH = process.env.QUALITY_PDF_PATH ?? '';

const O = DEFAULT_QUALITY_OPTIONS;

interface WhitespaceReport {
  page: number;
  usedRatio: number;
  gap: number;
  continued: boolean;
  orphan?: string;
  underfilled: boolean;
  /** 指摘の中身を人が読めるようにするための、そのページの末尾と次ページの先頭。 */
  tail: string;
  nextHead: string;
}

/** ページの読み順（上→下、同じ高さは左→右）に連結したテキスト。 */
function flow(page: QualityPage): string {
  return [...page]
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((item) => item.text)
    .join('');
}

/**
 * ページごとの版面利用率と、指摘に当たるかどうかを 1 行にまとめる。
 * `runQualityChecks` は headings / requiredTexts を要求するが、ここで見たい 2 つの検査は
 * 座標だけで決まるので、判定を同じ閾値で組み直して独立に測れるようにしている。
 */
function report(pages: QualityPage[], footerText = ''): WhitespaceReport[] {
  return pages.map((page, index) => {
    const fill = measurePageFill(page, O, footerText);
    const next = index + 1 < pages.length ? pages[index + 1] : undefined;
    const continued = next !== undefined && continuesPreviousCard(next, O);
    const underfilled =
      next !== undefined &&
      (continued ? fill.gap > O.maxContinuedBottomGap : fill.usedRatio < O.minSectionEndUsedRatio);
    return {
      page: index + 1,
      usedRatio: fill.usedRatio,
      gap: fill.gap,
      continued,
      orphan: findOrphanListMarker(page, O, footerText),
      underfilled,
      tail: flow(page).slice(-40),
      nextHead: next ? flow(next).slice(0, 40) : '',
    };
  });
}

function logReport(tag: string, rows: WhitespaceReport[]): void {
  const bad = rows.filter((r) => r.underfilled || r.orphan !== undefined);
  console.log(
    `[${tag}] pages=${rows.length} underfilled=${rows.filter((r) => r.underfilled).length} orphan=${rows.filter((r) => r.orphan !== undefined).length}`,
  );
  for (const r of bad) {
    console.log(
      `[${tag}] p${r.page} used=${(r.usedRatio * 100).toFixed(1)}% gap=${r.gap.toFixed(0)}pt continued=${r.continued}` +
        `${r.underfilled ? ' UNDERFILLED' : ''}${r.orphan !== undefined ? ` ORPHAN(${r.orphan})` : ''}\n` +
        `[${tag}]    …${r.tail} → 次ページ先頭: ${r.nextHead}…`,
    );
  }
}

describe('版面の空白の検査', () => {
  let fixturePages: QualityPage[];

  beforeAll(async () => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    // 登録しないと本番の改行ロジックを通らず、和文の途中に U+002D が入る。
    if (typeof Font.registerHyphenationCallback === 'function') {
      Font.registerHyphenationCallback(splitForHyphenation);
    }
    const blocks = buildPdfQualityFixtureBlocks();
    const buffer = await renderToBuffer(<PrintSkillSheetDocument title={PDF_QUALITY_FIXTURE_TITLE} blocks={blocks} />);
    fixturePages = await extractQualityPages(buffer);
  }, 300_000);

  it('検査の入力そのものが取れている（版面利用率が全ページで計算できる）', () => {
    const rows = report(fixturePages);
    logReport('whitespace:fixture', rows);
    // 閾値の妥当性は「正常なページの空きがどこまで伸びるか」で決まる。CI のログに
    // 上位を残しておかないと、レイアウトを変えたときに閾値が近づいたことに気付けない。
    const rank = (list: WhitespaceReport[]) =>
      [...list]
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 6)
        .map((r) => `p${r.page}=${r.gap.toFixed(0)}pt`)
        .join(' ');
    console.log(`[whitespace:fixture] 空き（同じカードが続く）: ${rank(rows.filter((r) => r.continued))}`);
    console.log(`[whitespace:fixture] 空き（次は新しい見出し）: ${rank(rows.filter((r) => !r.continued))}`);
    expect(rows.length).toBeGreaterThan(10);
    // 1 ページでも本文を検出できていなければ、閾値以前に測れていない。
    expect(rows.every((r) => r.usedRatio > 0)).toBe(true);
  });

  it('committed synthetic fixture が本物の箇条書き（BulletRow）を通っている', () => {
    // `orphan-list-marker` は BulletRow の行がページ境界に当たったときだけ鳴る。記号が
    // 1 つも描かれていないフィクスチャで「緑」になっても、それは検査が働いた証拠にならない。
    const markers = fixturePages.flat().filter((item) => item.text.trim() === '—').length;
    expect(markers).toBeGreaterThan(20);
  });

  it('committed synthetic fixture に、版面が埋まっていないページが無い', () => {
    const rows = report(fixturePages).filter((r) => r.underfilled);
    expect(rows.map((r) => `p${r.page} used=${(r.usedRatio * 100).toFixed(1)}% gap=${r.gap.toFixed(0)}pt`)).toEqual([]);
  });

  it('committed synthetic fixture に、記号だけが取り残された行が無い', () => {
    const rows = report(fixturePages).filter((r) => r.orphan !== undefined);
    expect(rows.map((r) => `p${r.page} ${r.orphan}`)).toEqual([]);
  });

  it.skipIf(!QUALITY_PDF_PATH)(
    'QUALITY_PDF_PATH の PDF に同じ検査を当てる（手元での確認用）',
    async () => {
      const pages = await extractQualityPages(readFileSync(QUALITY_PDF_PATH));
      const rows = report(pages);
      logReport('whitespace:external', rows);
      // 手元の確認用なので合否は決めない（何ページ読めたかだけ固定する）。
      expect(pages.length).toBeGreaterThan(0);
    },
    120_000,
  );
});
