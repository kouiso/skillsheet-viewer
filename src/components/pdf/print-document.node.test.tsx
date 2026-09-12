/**
 * 新しい印刷経路の PDF を描き、提出できる状態か（品質検査 7 項目 + ラスタ検査 2 項目）を測る。
 *
 * CI で常に実行するのは committed synthetic fixture（`fixtures/print-quality-fixture.ts`）を
 * 使う経路。実データ（本番 Neon の blocks テーブル）は個人情報のためリポジトリへコミット
 * できず、`REAL_BLOCKS_JSON` を渡したときだけ追加で走る（未指定でも CI のゲートは働く）。
 *
 * 合成フィクスチャは実データの内容を一切使わず、実データが持つ構造上の形
 * （会社をまたぐページ跨ぎ、詳細版/簡約版の両方、長文/短文、任意項目の欠落、非常に長い
 * タイトル、技術タグの畳み込み、スキル一覧の複数ページ跨ぎ）だけを再現している
 * （詳細はフィクスチャ自身のコメントを参照）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block } from '@/db/blocks';

import PDF_FONT_FAMILY from './constants';
import { buildPdfQualityFixtureBlocks, PDF_QUALITY_FIXTURE_TITLE } from './fixtures/print-quality-fixture';
import { splitForHyphenation } from './fonts';
import { buildCompletenessReport } from './print-completeness.node';
import { buildPrintSkillSheetDocument } from './print-document';
import { DEFAULT_QUALITY_OPTIONS, runQualityChecks, summarize, toSearchKey } from './print-quality';
import { runDuplicateHeadingChecks } from './print-quality-duplicate-heading';
import { extractQualityPages } from './print-quality-extract.node';
import { runRasterQualityChecks, summarizeRaster } from './print-quality-raster.node';
import { buildPrintViewModel, type PrintViewKey, type PrintViewModel } from './print-view-model';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'noto-sans-jp-regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'noto-sans-jp-bold.ttf');

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;
const OUT_PDF = process.env.PRINT_PDF_OUT;
const generatedAt = new Date();
const monthInput = process.env.PRINT_REFERENCE_MONTH;
if (monthInput !== undefined && (!/^\d+$/.test(monthInput) || !Number.isSafeInteger(Number(monthInput)))) {
  throw new Error('PRINT_REFERENCE_MONTH は年*12+月(0始まり)の整数で指定してください');
}
const referenceMonth =
  monthInput === undefined ? generatedAt.getFullYear() * 12 + generatedAt.getMonth() : Number(monthInput);

if (REAL_BLOCKS_JSON === undefined) {
  // スキップは vitest の一覧上では見えるが、大量のテストに埋もれて「実データでの確認が
  // 1度も走っていない」という事実がログから読み取りにくい。ここで明示しておく。
  console.warn(
    '[print-document.node.test.tsx] REAL_BLOCKS_JSON 未設定 — 実データのテキスト・ラスタ・見出し重複・完全性検査はスキップされる。' +
      'CI の実効ゲートは committed synthetic fixture を使うテストが担う（このファイルの別テスト）。',
  );
}

/**
 * pdfjs のテキスト層検査に必要な headings / requiredTexts を組み立てる。
 * 実データのテストと合成フィクスチャのテストで同じ組み立てを使う（重複を避ける）。
 * 描画と同じ VM 由来のため、VM 自体の欠落は検出できない。元ブロックとの完全性検査は別途必要。
 */
function buildTextQualityInputs(title: string, vm: PrintViewModel) {
  const projects = vm.companies.flatMap((c) => c.projects);
  const headings = [
    title,
    'スキル一覧',
    ...vm.companies.map((c) => c.name),
    ...projects.map((p) => p.title),
    // 簡約版の表が跨いだページは、fixed の列ヘッダーから始まる。
    '期間 案件 ／ 担当 チーム',
    // スキル一覧が 2 ページに跨ったときの継続ヘッダー。
    'スキル一覧（続き）',
    // 詳細版カードが跨いだページは継続ヘッダー（案件名）から始まる。
    ...projects.map((p) => `${p.title}（続き）`),
  ];
  const requiredTexts = projects.flatMap((p) =>
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
  );
  // running footer の左側（print-primitives.tsx の RunningFooter と同じ組み立て）。
  // 下端の踏み越え検査が footer 自身を本文と取り違えないために渡す。
  const footerText = [vm.summary.name, vm.summary.sheetTitle].filter(Boolean).join(' ／ ');
  return { headings, requiredTexts, footerText };
}

/** 実データの欠落本文をCIログへ出さず、件数だけでゲートを判定する。 */
function assertComplete(blocks: Block[], pages: Awaited<ReturnType<typeof extractQualityPages>>) {
  const report = buildCompletenessReport(blocks, pages, undefined, referenceMonth);
  expect(report.missing.length, 'PDF完全性: 元データの事実が欠落しています').toBe(0);
}

describe('新しい印刷経路の品質', () => {
  // テキスト層・ラスタ・見出し重複・完全性で同じ1回のレンダーを使い回す。
  // 検査ごとに render し直すと合成フィクスチャでも数十秒かかる処理を 3 倍にしてしまう。
  let fixtureBuffer: Buffer;
  let fixturePages: Awaited<ReturnType<typeof extractQualityPages>>;
  let fixtureVm: PrintViewModel;

  beforeAll(async () => {
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

    const blocks = buildPdfQualityFixtureBlocks();
    fixtureVm = buildPrintViewModel(PDF_QUALITY_FIXTURE_TITLE, blocks, undefined, referenceMonth);
    fixtureBuffer = await renderToBuffer(
      await buildPrintSkillSheetDocument({ title: PDF_QUALITY_FIXTURE_TITLE, blocks, referenceMonth }),
    );
    fixturePages = await extractQualityPages(fixtureBuffer);
  }, 120_000);

  it('committed synthetic fixture は多ページで会社をまたぐ分量になっている（前提の固定）', () => {
    // 会社をまたぐページ跨ぎ・複数ページの会社セクションを実際に含む分量であることの
    // 前提を固定する。ここが小さくなると「ページネーションを本当に検証した」と言えない。
    expect(fixturePages.length).toBeGreaterThan(10);
  });

  it('committed synthetic fixture で 7 項目すべて緑になる（CI の実効ゲート）', () => {
    const { headings, requiredTexts, footerText } = buildTextQualityInputs(PDF_QUALITY_FIXTURE_TITLE, fixtureVm);
    const findings = runQualityChecks(
      { pages: fixturePages, headings, requiredTexts, footerText },
      DEFAULT_QUALITY_OPTIONS,
    );
    console.log(`[print:fixture] pages=${fixturePages.length} findings=${findings.length} → ${summarize(findings)}`);
    for (const f of findings.slice(0, 20)) console.log(`[print:fixture] p${f.page} ${f.check}: ${f.detail}`);
    expect(findings).toEqual([]);
  });

  it('committed synthetic fixture でラスタ検査（文字を伴わない図形）が緑になる（CI の実効ゲート）', async () => {
    const rasterFindings = await runRasterQualityChecks(fixtureBuffer, fixturePages);
    console.log(`[print:fixture] raster findings=${rasterFindings.length} → ${summarizeRaster(rasterFindings)}`);
    for (const f of rasterFindings.slice(0, 20)) console.log(`[print:fixture] p${f.page} ${f.check}: ${f.detail}`);
    expect(rasterFindings).toEqual([]);
  }, 120_000);

  it('committed synthetic fixture で「続き」を伴わない見出しの重複が無い（CI の実効ゲート）', () => {
    const titles = fixtureVm.companies.flatMap((c) => c.projects.map((p) => p.title));
    const findings = runDuplicateHeadingChecks(fixturePages, titles);
    console.log(`[print:fixture] duplicate-heading findings=${findings.length}`);
    for (const f of findings) console.log(`[print:fixture] p${f.page} ${f.detail}`);
    expect(findings).toEqual([]);
  });

  it('合成PDFの完全性が通り、未描画の事実を追加すると同じゲートが失敗する', () => {
    const blocks = buildPdfQualityFixtureBlocks();
    assertComplete(blocks, fixturePages);
    const project = blocks.find((block) => block.type === 'project');
    if (project?.type !== 'project') throw new Error('合成案件がありません');
    project.data.items[0].duties += '\n\n完全性検査専用の未描画合成事実。';
    expect(() => assertComplete(blocks, fixturePages)).toThrow('PDF完全性');
  });

  it.skipIf(REAL_BLOCKS_JSON === undefined)(
    '実データでテキスト・ラスタ・見出し重複・完全性の全検査が緑になる',
    async () => {
      if (!REAL_BLOCKS_JSON || !existsSync(REAL_BLOCKS_JSON)) {
        throw new Error('REAL_BLOCKS_JSON の実データファイルがありません');
      }
      const parsed: unknown = JSON.parse(readFileSync(REAL_BLOCKS_JSON, 'utf-8'));
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('REAL_BLOCKS_JSON は空でないブロック配列を指定してください');
      }
      const blocks = parsed as Block[];
      const title = 'エンジニアスキルシート';
      const vm = buildPrintViewModel(title, blocks, undefined, referenceMonth);

      const buffer = await renderToBuffer(await buildPrintSkillSheetDocument({ title, blocks, referenceMonth }));
      if (OUT_PDF) writeFileSync(OUT_PDF, buffer, { mode: 0o600 });

      const pages = await extractQualityPages(buffer);
      if (process.env.PRINT_TEXT_OUT) {
        writeFileSync(
          process.env.PRINT_TEXT_OUT,
          pages.map((items, i) => `=== page ${i + 1} ===\n${items.map((it) => it.text).join('')}`).join('\n\n'),
          { mode: 0o600 },
        );
      }
      const { headings, requiredTexts, footerText } = buildTextQualityInputs(title, vm);
      const findings = runQualityChecks({ pages, headings, requiredTexts, footerText }, DEFAULT_QUALITY_OPTIONS);

      console.log(
        `[print] pages=${pages.length} 案件=${vm.companies.flatMap((c) => c.projects).length} findings=${findings.length} → ${summarize(findings)}`,
      );
      const byCheck = new Map<string, typeof findings>();
      for (const f of findings) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f]);
      for (const [check, list] of byCheck) {
        console.log(`[print] --- ${check} (${list.length}) ---`);
        for (const f of list.slice(0, 20)) console.log(`[print] p${f.page} ${f.detail}`);
      }

      // テキスト検査が失敗しても、同じ成果物に残りの検査を適用して結果をそろえる。
      const rasterFindings = await runRasterQualityChecks(buffer, pages);
      const titles = vm.companies.flatMap((company) => company.projects.map((project) => project.title));
      const duplicateHeadings = runDuplicateHeadingChecks(pages, titles);
      assertComplete(blocks, pages);
      console.log(
        `[print] raster findings=${rasterFindings.length} duplicate-heading findings=${duplicateHeadings.length}`,
      );
      expect({ text: findings, raster: rasterFindings, duplicateHeadings }).toEqual({
        text: [],
        raster: [],
        duplicateHeadings: [],
      });
    },
    300_000,
  );
});

describe('印刷経路: スキル一覧はビュートグルに従う', () => {
  beforeAll(() => {
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    if (typeof Font.registerHyphenationCallback === 'function') {
      Font.registerHyphenationCallback(splitForHyphenation);
    }
  });

  const title = PDF_QUALITY_FIXTURE_TITLE;
  const blocks: Block[] = buildPdfQualityFixtureBlocks();

  async function renderHeadingSet(views: PrintViewKey[] | undefined): Promise<Set<string>> {
    const buffer = await renderToBuffer(await buildPrintSkillSheetDocument({ title, blocks, views, referenceMonth }));
    const pages = await extractQualityPages(buffer);
    const fullText = pages.map((page) => page.map((item) => item.text).join('')).join('\n');
    return new Set(fullText.includes('スキル一覧') ? ['スキル一覧'] : []);
  }

  it('views が skills を含まない場合、スキル一覧セクションを出さない', async () => {
    const headings = await renderHeadingSet(['process', 'projects', 'timeline']);
    expect(headings.has('スキル一覧')).toBe(false);
  }, 60_000);

  it('views が skills を含む場合、スキル一覧セクションを出す', async () => {
    const headings = await renderHeadingSet(['skills', 'process', 'projects', 'timeline']);
    expect(headings.has('スキル一覧')).toBe(true);
  }, 60_000);

  it('views 未指定（既定）でも、画面の既定 ON に合わせてスキル一覧を出す', async () => {
    const headings = await renderHeadingSet(undefined);
    expect(headings.has('スキル一覧')).toBe(true);
  }, 60_000);

  it('推しモードの凡例を実PDFのテキスト層へ出す', async () => {
    const featuredBlocks = buildPdfQualityFixtureBlocks();
    const skills = featuredBlocks.find((block) => block.type === 'skills');
    if (skills?.type === 'skills' && skills.data.skills[0]) skills.data.skills[0].featured = true;

    const buffer = await renderToBuffer(
      await buildPrintSkillSheetDocument({ title, blocks: featuredBlocks, referenceMonth }),
    );
    const pages = await extractQualityPages(buffer);
    const fullText = pages.flatMap((page) => page.map((item) => item.text)).join('');
    const normalized = fullText.replaceAll(/\s/g, '');
    expect(normalized).toContain('塗り=主に使う技術／枠線=その他。カッコ内は経験年数。');
  }, 60_000);
});
