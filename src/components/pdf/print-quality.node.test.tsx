/**
 * 品質検査そのものが機能していることを、**現行の PDF に当てて赤が出ること**で証明する。
 *
 * 直す前に検査を通しておかないと、あとで緑になったのが「直ったから」なのか
 * 「検査が何も見ていないから」なのか区別が付かない。
 *
 * 実データ（本番 Neon の blocks テーブル）は個人情報のためリポジトリへコミットできない。
 * そのため既定では committed synthetic fixture（`fixtures/print-quality-fixture.ts`）で
 * この自己診断を回す。合成データでも脆弱なレイアウト（フォント 9.5pt）を通すには十分で、
 * `font-too-small` が必ず赤になることは実データの有無に関係ない。
 * 実データ（19 社 32 案件）にも当てたいときは、blocks テーブルの JSON を書き出して
 * `REAL_BLOCKS_JSON` に渡す（追加の確認であり、CI 必須の経路ではない）。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block } from '@/db/blocks';
import { blocksToMarkdown } from '@/db/blocks';

import PDF_FONT_FAMILY from './constants';
import { buildPdfQualityFixtureBlocks } from './fixtures/print-quality-fixture';
import { splitForHyphenation } from './fonts';
import {
  DEFAULT_QUALITY_OPTIONS,
  type QualityItem,
  type QualityPage,
  runQualityChecks,
  summarize,
  toSearchKey,
} from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';
import { buildPrintViewModel } from './print-view-model';
import { SkillSheetDocument } from './skill-sheet-document';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;

if (!REAL_BLOCKS_JSON) {
  // スキップではなく合成データへの切り替えだが、CI ログでどちらの経路を通ったかが
  // 埋もれないよう、ここで明示する（実データ経路は黙って通らないことがあるため）。
  console.warn(
    '[print-quality.node.test.tsx] REAL_BLOCKS_JSON 未設定 — committed synthetic fixture で自己診断する。' +
      '実データ（19社/32案件）でも確認したい場合は REAL_BLOCKS_JSON に blocks テーブルの JSON パスを渡すこと。',
  );
}

/** 実データが渡されていればそれを、無ければ合成フィクスチャを返す。CI は常に後者を通る。 */
function loadBlocks(): Block[] {
  if (REAL_BLOCKS_JSON && existsSync(REAL_BLOCKS_JSON)) {
    return JSON.parse(readFileSync(REAL_BLOCKS_JSON, 'utf-8')) as Block[];
  }
  return buildPdfQualityFixtureBlocks();
}

describe('品質検査が現行 PDF の欠陥を検出する', () => {
  beforeAll(() => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    // 本番（fonts.ts）と同じくハイフネーションコールバックを登録する。登録しないと
    // 和文の途中に U+002D が入る（実測で「（続-き）」「作成致-しました」が出た）。
    if (typeof Font.registerHyphenationCallback === 'function') {
      Font.registerHyphenationCallback(splitForHyphenation);
    }
  });

  it('現行 markdown 経路の PDF は複数の検査で赤になる', async () => {
    const blocks = loadBlocks();

    const title = 'エンジニアスキルシート';
    const vm = buildPrintViewModel(title, blocks);
    const headings = [
      ...vm.companies.map((c) => c.name),
      ...vm.companies.flatMap((c) => c.projects.map((p) => p.title)),
    ];
    const requiredTexts = vm.companies.flatMap((c) =>
      c.projects.flatMap((p) =>
        (
          [
            ['title', p.title],
            ['duties', p.duties],
            ['acquired', p.acquired],
            ['comment', p.comment],
          ] as const
        )
          .filter(([, text]) => text.length > 0)
          .map(([field, text]) => ({ label: `${p.title} / ${field}`, text: toSearchKey(text) })),
      ),
    );

    const buffer = await renderToBuffer(<SkillSheetDocument title={title} content={blocksToMarkdown(blocks)} />);
    const pages = await extractQualityPages(buffer);
    const findings = runQualityChecks({ pages, headings, requiredTexts }, DEFAULT_QUALITY_OPTIONS);

    console.log(`[baseline] pages=${pages.length} findings=${findings.length} → ${summarize(findings)}`);
    for (const f of findings.filter(
      (x) => x.check === 'overlap' || x.check === 'missing-content' || x.check === 'sparse-page',
    ))
      console.log(`[baseline] p${f.page} ${f.check}: ${f.detail}`);

    // 検査が何も見ていないなら、この行が落ちる。
    expect(findings.length).toBeGreaterThan(0);
    // 現行実装は fontSize 9.5 なので、最小フォントの検査は必ず赤になる。
    expect(findings.some((f) => f.check === 'font-too-small')).toBe(true);
  }, 300_000);
});

describe('sparse-page: 意図した空白ページの例外（company-grouping 作業）', () => {
  // 実レイアウトを描かず、pdfjs が返す座標配列を直接組み立てる（純関数なので描画不要）。
  const item = (text: string, y: number): QualityItem => ({ text, size: 11, x: 40, y, width: text.length * 5.5 });

  it('見出しだけの薄いページは、次ページも見出しから始まるなら除外する', () => {
    // p1: 会社見出し + 短い概要だけ（案件カードが丸ごと次ページへ送られた形）。
    // p2: 次の見出し（送られたカードの先頭）。p3: 最終ページ除外を避けるためのダミー。
    const pages: QualityPage[] = [
      [item('B社見出し', 800), item('概要文', 780)],
      [item('マッチングアプリの開発', 800)],
      [item('本文がここに来る想定のダミーページ', 800)],
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
      [item('会員基盤リプレイス', 800), item('少しだけ本文。', 780)],
      [item('と続くはずの本文がここで千切れて消えている状態を再現する', 800)],
      [item('本文がここに来る想定のダミーページ', 800)],
    ];
    const findings = runQualityChecks(
      { pages, headings: ['会員基盤リプレイス'], requiredTexts: [] },
      DEFAULT_QUALITY_OPTIONS,
    );
    expect(findings.some((f) => f.check === 'sparse-page' && f.page === 1)).toBe(true);
  });
});
