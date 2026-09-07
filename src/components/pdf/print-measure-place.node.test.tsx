/**
 * measure-then-place の前提を実バイト描画で固定する（react-pdf-capability の J 項目）:
 *
 *   「背の高い 1 ページ・`wrap={false}` で `layout()` した葉の高さ・行数は、
 *    同じ葉を明示的な `<Page>` に置き直して描いたときの高さ・行数と一致する」
 *
 * これが崩れると `paginate` の割り付けが実描画とズレ、本文が下端を突き抜けるか
 * ページが余る。ライブラリ更新・幅の変更（padding / レール）・ハイフネーション
 * callback の変更で壊れるので、fixture ではなく合成した葉で毎回検証する。
 * 実測（@react-pdf/renderer 4.5.1 / layout 4.6.1）: 492 葉で top の差 4.2e-5pt、
 * 行数不一致 0、予測 32 ページ = 実 32 ページ。
 */
import { existsSync } from 'node:fs';
import { Document, Font, Page, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constants';
import { splitForHyphenation } from './fonts';
import type { Leaf, MeasuredLeaf } from './print-leaf';
import { measureLeaf, measureLeaves, wrapLeaf } from './print-measure';
import { type PaginateOptions, type PrintPage, paginate } from './print-paginate';
import { BulletRow, Paragraph, printStyles, SectionLabel } from './print-primitives';
import { findBottomOverflows, findOverlaps } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';
import { splitTextAtLine } from './print-split-text';
import { PRINT_SIZE } from './print-tokens';
import { BOLD_TTF, REGULAR_TTF } from './test-font-paths';

/** 本文高さ = 842 − 42 − (32 + 14)。printStyles.page の padding と同じ値。 */
const CONTENT_HEIGHT = PRINT_SIZE.pageHeight - PRINT_SIZE.padTop - (PRINT_SIZE.padBottom + 14);

const SENTENCES = [
  'PostgreSQL + pgvector で類似検索を組み、OpenAPI の定義から型を生成する構成にした。',
  'ECS Fargate 上のバッチと SQS（+ DLQ）で非同期化し、失敗したジョブを再投入できるようにした。',
  'Structured Output でモデルの応答をスキーマに固定し、後段の TypeScript 側で検証している。',
  'CI/CD は GitHub Actions と Terraform で組み、plan の差分をレビューに載せる運用にした。',
  '要件定義から設計・実装・テストまでを一貫して担当し、関係者との合意形成を重視しながら進めた。',
  'gpt-4o-mini と Gemini を用途で使い分け、キャッシュ有無のトークン内訳を計測している。',
];

function sentence(seed: number, count: number): string {
  return Array.from({ length: count }, (_, i) => SENTENCES[(seed + i) % SENTENCES.length]).join('');
}

/**
 * 段落の長さの階段（1〜40 文）・見出し・箇条書きを混ぜた合成の葉。
 * ページ境界が段落の途中・見出しの直後・箇条書きの直前にまんべんなく当たるようにする。
 */
function buildLeaves(): Leaf[] {
  const leaves: Leaf[] = [];
  let n = 0;
  const push = (kind: Leaf['kind'], el: Leaf['el'], extra: Partial<Leaf> = {}) => {
    n++;
    leaves.push({
      id: `leaf-${n}`,
      kind,
      companyId: 'synthetic',
      el,
      keepWithNext: false,
      splittable: 'never',
      ...extra,
    });
  };
  for (let i = 0; i < 40; i++) {
    push('section-label', <SectionLabel>{`見出し ${i + 1}`}</SectionLabel>, { keepWithNext: true });
    const text = sentence(i, 1 + (i % 40));
    push('paragraph', <Paragraph>{text}</Paragraph>, { splittable: 'lines', text });
    if (i % 3 === 0) {
      push('bullet', <BulletRow>{sentence(i + 2, 1 + (i % 4))}</BulletRow>);
      push('bullet', <BulletRow>{sentence(i + 5, 2)}</BulletRow>);
    }
  }
  return leaves;
}

/** 段落を行境界で 2 つに割る。切れ目は元の本文の上で行の文字列を辿って決める（print-split-text.ts）。 */
const splitParagraph: PaginateOptions['split'] = (leaf, head) => {
  if (leaf.text === undefined || !leaf.lines) return undefined;
  const texts = splitTextAtLine(leaf.text, leaf.lines, head.length);
  if (!texts) return undefined;
  return {
    head: { ...leaf, id: `${leaf.id}:head`, text: texts.head, el: <Paragraph>{texts.head}</Paragraph> },
    tail: { ...leaf, id: `${leaf.id}:tail`, text: texts.tail, el: <Paragraph>{texts.tail}</Paragraph> },
  };
};

interface LayoutNode {
  type: string;
  box?: { top: number; height: number };
  lines?: unknown[];
  children?: LayoutNode[];
}

/** `onRender` の公開型は `{ blob }` だけだが、実装は layout 木も渡してくる（react-pdf-capability と同じ経路）。 */
function captureLayout(props: unknown): void {
  rendered = (props as { _INTERNAL__LAYOUT__DATA_?: LayoutNode })._INTERNAL__LAYOUT__DATA_;
}

let rendered: LayoutNode | undefined;

function collectTexts(node: LayoutNode, out: LayoutNode[]): void {
  if (node.type === 'TEXT') {
    out.push(node);
    return;
  }
  for (const child of node.children ?? []) collectTexts(child, out);
}

describe('measure-then-place: 測った高さと明示ページの実描画が一致する', () => {
  let leaves: Leaf[];
  let measured: MeasuredLeaf[];
  let pages: PrintPage[];
  let buffer: Buffer;
  let measureMs = 0;
  let oracleCalls = 0;

  beforeAll(async () => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found: ${REGULAR_TTF}`);
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: REGULAR_TTF, fontWeight: 400 },
        { src: BOLD_TTF, fontWeight: 700 },
      ],
    });
    Font.registerHyphenationCallback(splitForHyphenation);

    leaves = buildLeaves();
    const t0 = performance.now();
    measured = await measureLeaves(leaves);
    measureMs = performance.now() - t0;
    pages = await paginate(measured, {
      contentHeight: CONTENT_HEIGHT,
      split: splitParagraph,
      measure: (leaf) => {
        oracleCalls++;
        return measureLeaf(leaf);
      },
    });
    buffer = await renderToBuffer(
      <Document onRender={captureLayout}>
        {pages.map((page, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: ページは順序そのものが identity
          <Page key={index} size="A4" style={printStyles.page}>
            {page.leaves.map((placed) => wrapLeaf(placed.leaf))}
          </Page>
        ))}
      </Document>,
    );
  }, 300_000);

  it('measureLeaves は葉ごとに高さを返し、割れる段落には行が付く', () => {
    expect(measured).toHaveLength(leaves.length);
    expect(measured.every((leaf) => leaf.height > 0)).toBe(true);
    const paragraphs = measured.filter((leaf) => leaf.kind === 'paragraph');
    expect(paragraphs.every((leaf) => leaf.lines !== undefined && leaf.lines.length > 0)).toBe(true);
    const longest = Math.max(...paragraphs.map((leaf) => leaf.lines?.length ?? 0));
    // 40 文の段落はページの 1/3 を超える。行境界の分割経路が必ず 1 回以上走る長さ。
    expect(longest).toBeGreaterThan(20);
    // 2 Text の箇条書きには行が付かない（繋ぎ直せないので割らない）
    expect(measured.filter((leaf) => leaf.kind === 'bullet').every((leaf) => leaf.lines === undefined)).toBe(true);
    // 測定は 1 回の layout() で済む。10 秒を超えたら pdfkit 経路（描画あり）に落ちている。
    expect(measureMs).toBeLessThan(10_000);
  });

  it('予測ページ数 = 実描画ページ数 = pdfjs のページ数', async () => {
    expect(rendered?.children).toHaveLength(pages.length);
    const extracted = await extractQualityPages(buffer);
    expect(extracted).toHaveLength(pages.length);
    // 割り付けが起きる規模であること（10 ページ未満だと境界のケースが足りない）
    expect(pages.length).toBeGreaterThanOrEqual(10);
    expect(oracleCalls).toBeGreaterThan(0);
  });

  it('各葉の予測 top・高さが実描画と一致する（誤差 0.01pt 未満）', () => {
    const renderedPages = rendered?.children ?? [];
    let maxTopDiff = 0;
    let maxHeightDiff = 0;
    let compared = 0;
    for (const [pageIndex, page] of pages.entries()) {
      const nodes = renderedPages[pageIndex]?.children ?? [];
      expect(nodes).toHaveLength(page.leaves.length);
      for (const [leafIndex, placed] of page.leaves.entries()) {
        const box = nodes[leafIndex].box;
        if (!box) throw new Error(`page ${pageIndex + 1} leaf ${leafIndex} has no box`);
        maxTopDiff = Math.max(maxTopDiff, Math.abs(box.top - PRINT_SIZE.padTop - placed.top));
        maxHeightDiff = Math.max(maxHeightDiff, Math.abs(box.height - placed.leaf.height));
        compared++;
      }
    }
    expect(compared).toBe(pages.reduce((sum, page) => sum + page.leaves.length, 0));
    expect(maxTopDiff).toBeLessThan(0.01);
    expect(maxHeightDiff).toBeLessThan(0.01);
  });

  it('割った段落を含め、Text の行数が測定と実描画で一致する', () => {
    const renderedPages = rendered?.children ?? [];
    let mismatches = 0;
    for (const [pageIndex, page] of pages.entries()) {
      const nodes = renderedPages[pageIndex]?.children ?? [];
      for (const [leafIndex, placed] of page.leaves.entries()) {
        const lines = placed.leaf.lines;
        if (!lines) continue;
        const texts: LayoutNode[] = [];
        collectTexts(nodes[leafIndex], texts);
        if (texts.length !== 1 || (texts[0].lines?.length ?? -1) !== lines.length) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it('どのページも本文下端を超えず、文字の重なりも無い', async () => {
    const extracted = await extractQualityPages(buffer);
    for (const [index, page] of extracted.entries()) {
      expect(findBottomOverflows(page), `page ${index + 1}`).toEqual([]);
      expect(findOverlaps(page), `page ${index + 1}`).toEqual([]);
    }
    for (const page of pages) {
      expect(page.usedHeight).toBeLessThanOrEqual(CONTENT_HEIGHT + 0.01);
    }
  });

  it('見出しはページ末尾に残らず、割った段落の頭・尻は 2 行以上', () => {
    for (const [index, page] of pages.entries()) {
      const last = page.leaves[page.leaves.length - 1].leaf;
      if (index < pages.length - 1) expect(last.keepWithNext, `page ${index + 1}`).toBe(false);
      for (const placed of page.leaves) {
        if (placed.leaf.id.endsWith(':head') || placed.leaf.id.endsWith(':tail')) {
          expect(placed.leaf.lines?.length ?? 0, placed.leaf.id).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});
