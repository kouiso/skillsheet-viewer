/**
 * 要約版 PDF（digest-document.tsx）の品質検査。全文版（print-document.node.test.tsx）と
 * 同じ 3 段構成: コミット済み合成フィクスチャ → 大量フィクスチャ（19 社・33 案件）→
 * 実データ（REAL_BLOCKS_JSON、個人情報のためコミット不可・skipIf）。
 *
 * 「要約版は A4 で 2〜4 ページ」は要件そのものなので、ページ数自体をここで固定する。
 * 1 ページ目は全文版と同じ SummaryPage で、違いはタイトルの「（要約版）」だけ。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block } from '@/db/block';
import { digestTitle } from '@/lib/export/edition';

import PDF_FONT_FAMILY from './constant';
import { buildPrintDigestDocument, paginateDigest } from './digest-document';
import { buildDigestVolumeFixtureBlocks } from './fixture/digest-volume-fixture';
import { buildPdfQualityFixtureBlocks, PDF_QUALITY_FIXTURE_TITLE } from './fixture/print-quality-fixture';
import { splitForHyphenation } from './font';
import { DEFAULT_QUALITY_OPTIONS, runQualityChecks, toSearchKey } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';
import { runRasterQualityChecks } from './print-quality-raster.node';
import { buildPrintViewModel, type PrintViewModel } from './print-view-model';
import { BOLD_TTF, FONTS_DIR, REGULAR_TTF } from './test-font-path';

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;
const OUT_PDF = process.env.PRINT_DIGEST_PDF_OUT;

if (!REAL_BLOCKS_JSON) {
  console.warn(
    '[digest-document.node.test.tsx] REAL_BLOCKS_JSON 未設定 — 「実データで 4 ページ以下」はスキップされる。',
  );
}

/** 生タイトル（ページ 1 の kicker / footerText には要約版タイトルが載る）。 */
function buildTextQualityInputs(title: string, vm: PrintViewModel) {
  const projects = vm.companies.flatMap((c) => c.projects);
  const headings = [
    digestTitle(title),
    ...vm.companies.map((c) => c.name),
    // 列ヘッダーから始まるページ（先頭の本文葉・続きページの複製のどちらも）。
    '期間 案件 チーム',
    // 行から始まる続きページの継続見出し。
    ...vm.companies.map((c) => `${c.name}（つづき）`),
    // 1 ページ目が 2 ページに跨ったときの継続見出し。
    `${digestTitle(title)}（続き）`,
  ];
  const requiredTexts = [
    ...vm.companies.map((c) => ({ label: `会社「${c.name}」`, text: c.name })),
    ...projects.map((p) => ({
      label: `案件 ${p.index}. ${p.title}`,
      text: toSearchKey(`${p.index}. ${p.title}`),
    })),
  ];
  // running footer の左側（print-primitive.tsx の RunningFooter と同じ組み立て）。
  const footerText = [vm.summary.name, vm.summary.sheetTitle].filter(Boolean).join(' ／ ');
  return { headings, requiredTexts, footerText };
}

/**
 * 本文範囲の文字列だけを連結する。フッター（contentBottom より下）と絶対配置の
 * 継続見出し（contentTop より上）は、既存の 1 行制限で「…」を含みうるため範囲外。
 */
function bodyText(pages: Awaited<ReturnType<typeof extractQualityPages>>): string {
  return pages
    .map((page) =>
      page
        .filter(
          (item) => item.y > DEFAULT_QUALITY_OPTIONS.contentBottom && item.y <= DEFAULT_QUALITY_OPTIONS.contentTop,
        )
        .map((item) => item.text)
        .join(''),
    )
    .join('');
}

/** 1 回の描画結果（バッファ + テキスト層 + ページ割り）をまとめて持つ。 */
interface RenderedDigest {
  buffer: Buffer;
  pages: Awaited<ReturnType<typeof extractQualityPages>>;
  vm: PrintViewModel;
  listPageCount: number;
}

async function renderDigest(title: string, blocks: Block[]): Promise<RenderedDigest> {
  const vm = buildPrintViewModel(digestTitle(title), blocks);
  const buffer = await renderToBuffer(await buildPrintDigestDocument({ title, blocks }));
  const pages = await extractQualityPages(buffer);
  const listPages = await paginateDigest(vm);
  return { buffer, pages, vm, listPageCount: listPages.length };
}

function expectCleanQuality(title: string, rendered: RenderedDigest) {
  const { headings, requiredTexts, footerText } = buildTextQualityInputs(title, rendered.vm);
  const findings = runQualityChecks(
    { pages: rendered.pages, headings, requiredTexts, footerText },
    DEFAULT_QUALITY_OPTIONS,
  );
  for (const f of findings.slice(0, 20)) console.log(`[digest] p${f.page} ${f.check}: ${f.detail}`);
  expect(findings).toEqual([]);
}

function expectBodyTextClean(rendered: RenderedDigest) {
  const text = bodyText(rendered.pages);
  expect(text).not.toContain('…');
  expect(text).not.toMatch(/他\s*\d+\s*件/);
}

/** 全ページの文字を結合し、`${index}. ` が案件ごとに 1 回ずつ現れることを確かめる。 */
function expectProjectNumbering(rendered: RenderedDigest) {
  // pdfjs は 1 行を字種ごとの run に分けて返すため、空白を落としてから突合する。
  // 期間列の値（例: '2025.04–06'）が直前に接着するので、`${index}. ` 単独ではなく
  // 「番号 + 案件名」の組で数える（タイトルはフィクスチャ内で全件ユニーク）。
  const flat = rendered.pages
    .map((p) => p.map((i) => i.text).join(''))
    .join('')
    .replace(/\s+/g, '');
  for (const company of rendered.vm.companies) {
    expect(flat).toContain(company.name.replace(/\s+/g, ''));
    for (const project of company.projects) {
      const key = `${project.index}.${project.title}`.replace(/\s+/g, '');
      const occurrences = flat.split(key).length - 1;
      expect(occurrences, `${key} の出現回数`).toBe(1);
    }
  }
}

describe('要約版 PDF の品質', () => {
  let fixture: RenderedDigest;
  let volume: RenderedDigest;
  const VOLUME_TITLE = '要約版 大量検証';

  beforeAll(async () => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    // 本番（font.ts）と同じくハイフネーションコールバックを登録する。
    if (typeof Font.registerHyphenationCallback === 'function') {
      Font.registerHyphenationCallback(splitForHyphenation);
    }

    // 2 つのフィクスチャを 1 回ずつ描画して共有する（検査ごとの再描画は高いので）。
    fixture = await renderDigest(PDF_QUALITY_FIXTURE_TITLE, buildPdfQualityFixtureBlocks());
    volume = await renderDigest(VOLUME_TITLE, buildDigestVolumeFixtureBlocks());
  }, 300_000);

  it('合成フィクスチャで総ページ数が 2〜4', () => {
    expect(fixture.pages.length).toBeGreaterThanOrEqual(2);
    expect(fixture.pages.length).toBeLessThanOrEqual(4);
    console.log(`[digest:fixture] pages=${fixture.pages.length} listPages=${fixture.listPageCount}`);
  });

  it('大量フィクスチャ（19 社・33 案件）で総ページ数が 4 以下', () => {
    expect(volume.pages.length).toBeLessThanOrEqual(4);
    console.log(`[digest:volume] pages=${volume.pages.length} listPages=${volume.listPageCount}`);
  });

  it('両フィクスチャで 1 ページ目がちょうど 1 ページ', () => {
    // 総ページ数 − 会社一覧のページ数 = 1 ページ目のページ数。
    expect(fixture.pages.length - fixture.listPageCount).toBe(1);
    expect(volume.pages.length - volume.listPageCount).toBe(1);
  });

  it('合成フィクスチャで品質検査がすべて緑', () => {
    expectCleanQuality(PDF_QUALITY_FIXTURE_TITLE, fixture);
  });

  it('大量フィクスチャで品質検査がすべて緑', () => {
    expectCleanQuality(VOLUME_TITLE, volume);
  });

  it('合成フィクスチャでラスタ検査が緑', async () => {
    const findings = await runRasterQualityChecks(fixture.buffer, fixture.pages);
    for (const f of findings.slice(0, 20)) console.log(`[digest:fixture] p${f.page} ${f.check}: ${f.detail}`);
    expect(findings).toEqual([]);
  }, 120_000);

  it('大量フィクスチャでラスタ検査が緑', async () => {
    const findings = await runRasterQualityChecks(volume.buffer, volume.pages);
    for (const f of findings.slice(0, 20)) console.log(`[digest:volume] p${f.page} ${f.check}: ${f.detail}`);
    expect(findings).toEqual([]);
  }, 120_000);

  it('通し番号付き案件名が全件 1 回ずつ、各社名が含まれる（合成フィクスチャ）', () => {
    expectProjectNumbering(fixture);
  });

  it('通し番号付き案件名が全件 1 回ずつ、各社名が含まれる（大量フィクスチャ）', () => {
    expectProjectNumbering(volume);
  });

  it('本文範囲に「…」と「他 N 件」が無い（合成フィクスチャ）', () => {
    expectBodyTextClean(fixture);
  });

  it('本文範囲に「…」と「他 N 件」が無い（大量フィクスチャ）', () => {
    expectBodyTextClean(volume);
  });

  it('非表示の会社と案件は要約版に出ない', async () => {
    // print-view-model.test.ts の blocksFixture（非表示の会社 c3 とその案件 p3 を含む）と
    // 同じ作り + 表示会社の中に非表示案件を 1 件足したもの。
    const tech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
    const blocks: Block[] = [
      {
        id: 'b1',
        order: 0,
        type: 'profile',
        data: {
          name: 'I・K',
          title: '',
          pr: '自己紹介の本文。',
          strengths: [],
          meta: { age: '28 歳' },
          company: '株式会社 X',
        },
      },
      {
        id: 'b2',
        order: 1,
        type: 'skills',
        data: { category: '言語', skills: [{ name: 'TypeScript', years: 8, level: '上級' }] },
      },
      { id: 'b3', order: 2, type: 'stats', data: { items: [{ value: '8', unit: '年', label: 'エンジニア歴' }] } },
      {
        id: 'b4',
        order: 3,
        type: 'project',
        data: {
          companies: [
            { id: 'c1', name: '新しい会社', kind: '業務委託', period: '2026 年 1 月〜2026 年 9 月', note: '概要文。' },
            { id: 'c2', name: '古い会社', kind: '受託', period: '2017 年 8 月〜2018 年 1 月', note: '' },
            { id: 'c3', name: '隠した会社', kind: '受託', period: '', note: '', hidden: true },
          ],
          items: [
            {
              id: 'p1',
              companyId: 'c1',
              title: '新しい案件',
              scope: '',
              period: '2026.01 — 2026.09',
              role: 'PL',
              team: '5 名',
              tech,
              process: [],
              duties: '',
              acquired: '',
              comment: '',
            },
            {
              id: 'p1h',
              companyId: 'c1',
              title: '隠した表示会社の案件',
              scope: '',
              period: '2026.10 — 2026.12',
              role: '',
              team: '',
              tech,
              process: [],
              duties: '',
              acquired: '',
              comment: '',
              hidden: true,
            },
            {
              id: 'p2',
              companyId: 'c2',
              title: '古い案件',
              scope: '',
              period: '2017.08 — 2018.01',
              role: '',
              team: '1 名',
              tech,
              process: [],
              duties: '',
              acquired: '',
              comment: '',
            },
            {
              id: 'p3',
              companyId: 'c3',
              title: '隠した案件',
              scope: '',
              period: '2020.01 — 2020.02',
              role: '',
              team: '',
              tech,
              process: [],
              duties: '',
              acquired: '',
              comment: '',
            },
          ],
        },
      },
    ];

    const buffer = await renderToBuffer(await buildPrintDigestDocument({ title: '非表示検証', blocks }));
    const pages = await extractQualityPages(buffer);
    const flat = bodyText(pages).replace(/\s+/g, '');
    expect(flat).toContain('新しい会社');
    expect(flat).toContain('古い会社');
    expect(flat).toContain('1.新しい案件');
    expect(flat).toContain('2.古い案件');
    expect(flat).not.toContain('隠した会社');
    expect(flat).not.toContain('隠した案件');
    expect(flat).not.toContain('隠した表示会社の案件');
  }, 120_000);

  it('案件ブロックの会社と案件が空なら buildPrintDigestDocument は reject、paginateDigest は []', async () => {
    const blocks: Block[] = [
      {
        id: 'p1',
        order: 0,
        type: 'profile',
        data: { name: '空案件テスト', title: '', pr: '', strengths: [], meta: {} },
      },
      { id: 'pj1', order: 1, type: 'project', data: { companies: [], items: [] } },
    ];
    await expect(buildPrintDigestDocument({ title: '空案件', blocks })).rejects.toThrow(
      'digest edition requires at least one visible project',
    );
    const vm = buildPrintViewModel(digestTitle('空案件'), blocks);
    await expect(paginateDigest(vm)).resolves.toEqual([]);
  });

  it.skipIf(!REAL_BLOCKS_JSON)(
    '実データで 4 ページ以下・品質検査がすべて緑',
    async () => {
      const blocks = JSON.parse(readFileSync(REAL_BLOCKS_JSON as string, 'utf-8')) as Block[];
      const title = 'エンジニアスキルシート';
      const rendered = await renderDigest(title, blocks);
      if (OUT_PDF) writeFileSync(OUT_PDF, rendered.buffer);

      console.log(
        `[digest:real] pages=${rendered.pages.length} listPages=${rendered.listPageCount} firstPage=${rendered.pages.length - rendered.listPageCount} 案件=${rendered.vm.companies.flatMap((c) => c.projects).length}`,
      );
      expect(rendered.pages.length).toBeLessThanOrEqual(4);
      expectCleanQuality(title, rendered);
    },
    300_000,
  );
});
