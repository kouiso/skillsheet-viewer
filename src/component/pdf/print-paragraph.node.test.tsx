import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Document, Font, Page, renderToBuffer, View } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import PDF_FONT_FAMILY from './constant';
import { splitForHyphenation } from './font';
import { checkLineBreakQuality, LINE_BREAK_RULES } from './line-break-quality';
import type { Leaf } from './print-leaf';
import { splitLeaf } from './print-leaf-list';
import { markdownPieces, PrintMarkdown } from './print-markdown';
import { measureLeaf, measureLeaves, wrapLeaf } from './print-measure';
import { paginate } from './print-paginate';
import { displayParagraphRegions } from './print-paragraph-region';
import { Paragraph, printStyles } from './print-primitive';
import { extractQualityPages } from './print-quality-extract.node';

// Observe the actual measured-route pieces; no production source dictionary API.
const displayParagraphTexts = (text: string) =>
  markdownPieces(text)
    .filter((piece) => piece.displayParagraphGroup)
    .map((piece) => piece.displayParagraphText ?? '');

const sentence = '業務の課題を整理し、担当者と確認した内容に基づいて検証を行い、対応結果を記録しました。';
const compact = (value: string) => value.replace(/\s+/gu, '');

/** The measured project route consumes these actual pieces; direct automatic
 * PrintMarkdown deliberately preserves the author's original paragraphs. */
function DisplayPieces({ text }: { text: string }) {
  return (
    <View>
      {markdownPieces(text).map((piece) => (
        <View key={piece.el.key} style={{ marginTop: piece.gap, paddingLeft: piece.indent }}>
          {piece.el}
        </View>
      ))}
    </View>
  );
}

/** Actual measured frames matching DisplayPieces above, never inferred from a source dictionary. */
async function measuredRegions(text: string) {
  const leaves: Leaf[] = markdownPieces(text).map((piece, index) => ({
    id: `region-${index}`,
    companyId: 'synthetic',
    kind: 'paragraph',
    el: piece.el,
    text: piece.text,
    keepWithNext: false,
    splittable: 'never',
    displayParagraphGroup: piece.displayParagraphGroup,
    displayParagraphText: piece.displayParagraphText,
    frame: { rail: false, gapAbove: piece.gap, marginBottom: 0, card: null, indent: piece.indent, endMarker: false },
  }));
  const measured = await measureLeaves(leaves);
  let top = 0;
  const placed = measured.map((leaf) => {
    const result = { leaf, top };
    top += leaf.height;
    return result;
  });
  return displayParagraphRegions([{ leaves: placed, usedHeight: top }], 1);
}

beforeAll(() => {
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: path.resolve('public/font/noto-sans-jp-regular.ttf'), fontWeight: 400 },
      { src: path.resolve('public/font/noto-sans-jp-bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback(splitForHyphenation);
});

describe('long prose in rendered PDF', () => {
  it('scopes measured display ends to the actual leaf box, even with identical text in another field', async () => {
    const shared = `${'検'.repeat(86)}完了。`;
    const sourceA = `${shared}${'照'.repeat(78)}終了。`;
    const suffixB = '追加の確認を行った結果をまとめました。';
    const sourceB = shared + suffixB;
    const leaf = (id: string, text: string, group?: object): Leaf => ({
      id,
      companyId: 'synthetic',
      kind: 'paragraph',
      el: <Paragraph>{text}</Paragraph>,
      text,
      keepWithNext: false,
      splittable: 'never',
      displayParagraphGroup: group,
      displayParagraphText: group ? text : undefined,
      frame: { rail: false, gapAbove: 4, marginBottom: 0, card: null, indent: 0, endMarker: false },
    });
    const group = {};
    const measured = await measureLeaves([
      leaf('A-first', shared, group),
      leaf('A-second', sourceA.slice(shared.length), group),
      leaf('B-first', shared),
      leaf('B-second', suffixB),
    ]);
    const aHeight = measured[0].height + measured[1].height;
    const projectPages = [
      {
        usedHeight: aHeight + measured[2].height,
        leaves: [
          { leaf: measured[0], top: 0 },
          { leaf: measured[1], top: measured[0].height },
          { leaf: measured[2], top: aHeight },
        ],
      },
      { usedHeight: measured[3].height, leaves: [{ leaf: measured[3], top: 0 }] },
    ];
    const buffer = await renderToBuffer(
      <Document>
        {projectPages.map((page) => (
          <Page key={page.leaves[0].leaf.id} size="A4" style={printStyles.page}>
            {page.leaves.map((placed) => (
              <View key={placed.leaf.id}>{wrapLeaf(placed.leaf)}</View>
            ))}
          </Page>
        ))}
      </Document>,
    );
    const pages = await extractQualityPages(buffer);
    const baseline = checkLineBreakQuality(pages, { sourceTexts: [sourceA, sourceB] });
    expect(baseline.counts['early-break']).toBe(2);
    const regions = displayParagraphRegions(projectPages, pages.length);
    expect(regions).toHaveLength(2);
    expect(displayParagraphRegions(projectPages, 1)).toEqual([]);
    expect(displayParagraphRegions(projectPages, Number.NaN)).toEqual([]);
    expect(displayParagraphRegions(projectPages, 2.5)).toEqual([]);
    expect(
      checkLineBreakQuality(pages, { sourceTexts: [sourceA, sourceB], displayParagraphRegions: regions }).counts[
        'early-break'
      ],
    ).toBe(1);
    // A region with the right text on the wrong page is not evidence.
    expect(
      checkLineBreakQuality(pages, {
        sourceTexts: [sourceA, sourceB],
        displayParagraphRegions: regions.map((region) => ({ ...region, page: region.page + 1 })),
      }).counts['early-break'],
    ).toBe(2);
  });

  it('measures decorated display pieces and keeps their one-line tails with the original group', async () => {
    for (const ending of ['**短い結果です。**', '[短い結果です。](https://example.test/guide)']) {
      const pieces: Leaf[] = markdownPieces(`${'検'.repeat(129)}完了。${ending}`).map((piece, index) => ({
        id: `decorated-${index}`,
        companyId: 'synthetic',
        kind: 'paragraph',
        el: piece.el,
        text: piece.text,
        remake: piece.remake,
        keepWithNext: false,
        splittable: piece.text ? 'lines' : 'never',
        displayParagraphGroup: piece.displayParagraphGroup,
        displayParagraphText: piece.displayParagraphText,
      }));
      const measured = await measureLeaves(pieces);
      expect(measured.map((leaf) => leaf.displayParagraphLineCount)).toEqual([3, 1]);
      expect(measured[0].keepWithNext).toBe(true);
      const filler = await measureLeaf({
        id: 'decorated-filler',
        companyId: 'synthetic',
        kind: 'block',
        el: <View style={{ height: 754 - measured[0].height }} />,
        keepWithNext: false,
        splittable: 'never',
      });
      const pages = await paginate([filler, ...measured], {
        contentHeight: 754,
        split: splitLeaf,
        measure: measureLeaf,
      });
      expect(pages[1].leaves.map((placed) => placed.leaf.displayParagraphLineCount)).toEqual([1, 1]);
    }
  });
  it('keeps the automatic-flow display tail with at least one preceding line', async () => {
    const source = `${'検'.repeat(129)}完了。短い結果です。`;
    const first = await measureLeaf({
      id: 'auto-height',
      companyId: 'synthetic',
      kind: 'paragraph',
      el: <Paragraph>{`${'検'.repeat(129)}完了。`}</Paragraph>,
      keepWithNext: false,
      splittable: 'never',
    });
    for (const extra of [0, 1, 10]) {
      for (const nested of [false, true]) {
        const content = <PrintMarkdown text={source} />;
        const buffer = await renderToBuffer(
          <Document>
            <Page size="A4" style={printStyles.page}>
              <View style={{ height: 754 - first.height - extra }} />
              {nested ? <View>{content}</View> : content}
            </Page>
          </Document>,
        );
        const pages = await extractQualityPages(buffer);
        expect(pages).toHaveLength(2);
        expect(
          compact(
            pages
              .flat()
              .map((item) => item.text)
              .join(''),
          ),
        ).toBe(source);
        const secondLines = new Set(
          pages[1].filter((item) => item.text.trim()).map((item) => Math.round(item.y * 10) / 10),
        );
        expect(secondLines.size, `available=${first.height + extra}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('identifies measured split prose before independent paragraphs, lists, quotes and tables', async () => {
    const source = `${'検'.repeat(86)}完了。${'照'.repeat(86)}終了。`;
    for (const suffix of [
      `\n\n${'あ'.repeat(130)}。`,
      '\n\n- 追加の項目です。',
      '\n\n> 引用の確認です。',
      '\n\n| 項目 | 内容 |\n| --- | --- |\n| 確認 | 結果 |',
    ]) {
      const markdown = source + suffix;
      const buffer = await renderToBuffer(
        <Document>
          <Page size="A4" style={printStyles.page}>
            <DisplayPieces text={markdown} />
          </Page>
        </Document>,
      );
      const pages = await extractQualityPages(buffer);
      expect(checkLineBreakQuality(pages, { sourceTexts: [markdown] }).counts['early-break']).toBeGreaterThan(0);
      expect(
        checkLineBreakQuality(pages, {
          sourceTexts: [markdown],
          displayParagraphRegions: await measuredRegions(markdown),
        }).counts['early-break'],
      ).toBe(0);
    }
  });
  it('keeps a measured one-line display tail with its preceding piece', async () => {
    const source = `${'検'.repeat(129)}完了。短い結果です。`;
    const pieces: Leaf[] = markdownPieces(source).map((piece, index) => ({
      id: `synthetic-piece-${index}`,
      companyId: 'synthetic',
      kind: 'paragraph',
      el: piece.el,
      text: piece.text,
      remake: piece.remake,
      keepWithNext: false,
      splittable: piece.text ? 'lines' : 'never',
      displayParagraphGroup: piece.displayParagraphGroup,
      displayParagraphText: piece.displayParagraphText,
      frame: { rail: false, gapAbove: piece.gap, marginBottom: 0, card: null, indent: 0, endMarker: false },
    }));
    const measured = await measureLeaves(pieces);
    expect(measured.map((leaf) => leaf.displayParagraphLineCount)).toEqual([3, 1]);
    expect(measured[0].keepWithNext).toBe(true);
    const contentHeight = 754;
    const filler = await measureLeaf({
      id: 'synthetic-filler',
      companyId: 'synthetic',
      kind: 'block',
      keepWithNext: false,
      splittable: 'never',
      el: <View style={{ height: contentHeight - measured[0].height }} />,
    });
    const pages = await paginate([filler, ...measured], { contentHeight, split: splitLeaf, measure: measureLeaf });
    expect(pages).toHaveLength(2);
    expect(pages[0].leaves.at(-1)?.leaf.displayParagraphLineCount).toBe(2);
    expect(pages[0].leaves.at(-1)?.leaf.displayParagraphText).toBeUndefined();
    expect(pages[1].leaves.map((placed) => placed.leaf.displayParagraphLineCount)).toEqual([1, 1]);
    const buffer = await renderToBuffer(
      <Document>
        {pages.map((page) => (
          <Page key={page.leaves[0].leaf.id} size="A4" style={printStyles.page}>
            {page.leaves.map((placed) => (
              <View key={placed.leaf.id}>{wrapLeaf(placed.leaf)}</View>
            ))}
          </Page>
        ))}
      </Document>,
    );
    const extracted = await extractQualityPages(buffer);
    const evidenceDir = process.env.PARAGRAPH_EVIDENCE_DIR;
    if (evidenceDir) {
      mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
      writeFileSync(path.join(evidenceDir, 'synthetic-widow.pdf'), buffer, { mode: 0o600 });
    }
    expect(
      compact(
        extracted
          .flat()
          .map((item) => item.text)
          .join(''),
      ),
    ).toBe(source);
    const report = checkLineBreakQuality(extracted, {
      sourceTexts: [source],
      displayParagraphRegions: displayParagraphRegions(pages, extracted.length),
    });
    for (const rule of LINE_BREAK_RULES) expect(report.counts[rule], rule).toBe(0);
    // A very small page cannot fit the entire group. Existing pager fallback
    // must still make progress rather than moving the chain forever.
    const narrow = await paginate(measured, { contentHeight: 45, split: splitLeaf, measure: measureLeaf });
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.flatMap((page) => page.leaves).length).toBeGreaterThanOrEqual(2);
  });
  it('does not exempt an unsplit field sharing a displayed paragraph prefix across pages', async () => {
    const shared = `${'検'.repeat(86)}完了。`;
    const sourceA = `${shared}${'照'.repeat(78)}終了。`;
    const suffixB = '追加の確認を行った結果をまとめました。';
    const sourceB = shared + suffixB;
    expect(displayParagraphTexts(sourceB)).toEqual([]);
    // Deliberately render an incorrect split in B. Its original source has no
    // paragraph boundary here; A's genuine boundary must not excuse it.
    const buffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={printStyles.page}>
          <Paragraph>{shared}</Paragraph>
        </Page>
        <Page size="A4" style={printStyles.page}>
          <Paragraph>{suffixB}</Paragraph>
        </Page>
      </Document>,
    );
    const pages = await extractQualityPages(buffer);
    const sources = [sourceA, sourceB];
    expect(checkLineBreakQuality(pages, { sourceTexts: sources }).counts['early-break']).toBe(1);
    expect(
      checkLineBreakQuality(pages, {
        sourceTexts: sources,
        displayParagraphRegions: [],
      }).counts['early-break'],
    ).toBe(1);
    // Also retain the exemption when A itself is rendered with B present in
    // the dictionary: the next rendered text identifies the actual source.
    const goodBuffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={printStyles.page}>
          <DisplayPieces text={sourceA} />
        </Page>
      </Document>,
    );
    expect(
      checkLineBreakQuality(await extractQualityPages(goodBuffer), {
        sourceTexts: sources,
        displayParagraphRegions: await measuredRegions(sourceA),
      }).counts['early-break'],
    ).toBe(0);
    const sameVisibleAuthored = `${'検'.repeat(20)}\n${sourceA.slice(20)}`;
    expect(displayParagraphTexts(sameVisibleAuthored)).toEqual([]);
    const tightBuffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={printStyles.page}>
          <Paragraph>{`${'検'.repeat(44)}\n${'検'.repeat(42)}\n完了。\n${'照'.repeat(78)}終了。`}</Paragraph>
        </Page>
      </Document>,
    );
    const tightPages = await extractQualityPages(tightBuffer);
    const tightSources = [sourceA, sameVisibleAuthored];
    const originalCount = checkLineBreakQuality(tightPages, { sourceTexts: tightSources }).counts['early-break'];
    expect(originalCount).toBeGreaterThan(0);
    expect(
      checkLineBreakQuality(tightPages, {
        sourceTexts: tightSources,
        displayParagraphRegions: await measuredRegions(sourceA),
      }).counts['early-break'],
    ).toBe(originalCount);
  });
  it('uses the actual paragraph end for terminal-line protection, while rejecting a truly early wrap', async () => {
    const first = `${'検'.repeat(86)}完了。`;
    const second = `${'照'.repeat(78)}終了。`;
    const source = first + second;
    const buffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={printStyles.page}>
          <DisplayPieces text={source} />
        </Page>
      </Document>,
    );
    const pages = await extractQualityPages(buffer);
    // The full field continues beyond the end of the first displayed paragraph.
    // Using it alone mistakes the three-character terminal-line protection for an early wrap.
    expect(checkLineBreakQuality(pages, { sourceTexts: [source] }).counts['early-break']).toBe(1);
    const actualParagraphs = displayParagraphTexts(source);
    expect(actualParagraphs).toEqual([first, second]);
    const regions = await measuredRegions(source);
    const corrected = checkLineBreakQuality(pages, { sourceTexts: [source], displayParagraphRegions: regions });
    for (const rule of LINE_BREAK_RULES) expect(corrected.counts[rule], rule).toBe(0);
    const badWrap = [
      [
        { text: '検'.repeat(20), x: 40, y: 800, width: 230, size: 11.5 },
        { text: '検'.repeat(44), x: 40, y: 779.875, width: 506, size: 11.5 },
        { text: `${'検'.repeat(22)}完了。`, x: 40, y: 759.75, width: 287.5, size: 11.5 },
      ],
    ];
    expect(
      checkLineBreakQuality(badWrap, { sourceTexts: [source], displayParagraphRegions: regions }).counts['early-break'],
    ).toBe(1);
  });

  it('reproduces the unchanged long-paragraph gate on a genuine unbroken paragraph', async () => {
    const source = sentence.repeat(6);
    const buffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={printStyles.page}>
          <Paragraph>{source}</Paragraph>
        </Page>
      </Document>,
    );
    const pages = await extractQualityPages(buffer);
    expect(checkLineBreakQuality(pages, { sourceTexts: [source] }).counts['long-paragraph']).toBe(1);
    expect(
      compact(
        pages
          .flat()
          .map((item) => item.text)
          .join(''),
      ),
    ).toBe(compact(source));
    // One authored newline does not excuse a subsequent truly long line from the gate.
    const withBreak = `短い行。\n${source}`;
    expect(displayParagraphTexts(withBreak)).toEqual([]);
    const preservedBuffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={printStyles.page}>
          <PrintMarkdown text={withBreak} />
        </Page>
      </Document>,
    );
    const preservedPages = await extractQualityPages(preservedBuffer);
    expect(checkLineBreakQuality(preservedPages, { sourceTexts: [withBreak] }).counts['long-paragraph']).toBe(1);
    expect(
      compact(
        preservedPages
          .flat()
          .map((item) => item.text)
          .join(''),
      ),
    ).toBe(compact(withBreak));
  });

  it('renders readable sentence groups with all text, links, code, Japanese glyphs and list structure retained', async () => {
    const cases = [
      { markdown: sentence.repeat(6), text: sentence.repeat(6) },
      {
        markdown: `${sentence.repeat(2)}**${sentence}**[資料](https://example.test/guide)と\`sample_code\`を確認しました。${sentence.repeat(2)}`,
        text: `${sentence.repeat(3)}資料とsample_codeを確認しました。${sentence.repeat(2)}`,
      },
      {
        markdown: `${sentence.repeat(2)}「確認しました。」という回答を記録しました。${sentence.repeat(2)}日本語、漢字・ひらがな・カタカナを確認しました。`,
        text: `${sentence.repeat(2)}「確認しました。」という回答を記録しました。${sentence.repeat(2)}日本語、漢字・ひらがな・カタカナを確認しました。`,
      },
      {
        markdown: `3. ${sentence}\n4. 確認結果を記録しました。\n   - 子項目として結果を共有しました。`,
        text: `3.${sentence}4.確認結果を記録しました。—子項目として結果を共有しました。`,
      },
    ];
    const buffer = await renderToBuffer(
      <Document>
        {cases.map((item) => (
          <Page key={item.markdown} size="A4" style={printStyles.page}>
            <DisplayPieces text={item.markdown} />
          </Page>
        ))}
      </Document>,
    );
    const pages = await extractQualityPages(buffer);
    expect(pages).toHaveLength(cases.length);
    for (const [index, page] of pages.entries()) {
      expect(compact(page.map((item) => item.text).join(''))).toBe(compact(cases[index].text));
      expect(Math.min(...page.filter((item) => item.text.trim()).map((item) => item.size))).toBeGreaterThanOrEqual(11);
      expect(page.map((item) => item.text).join('')).not.toContain('\uFFFD');
      const report = checkLineBreakQuality([page], { sourceTexts: [cases[index].text] });
      for (const rule of LINE_BREAK_RULES) expect(report.counts[rule], `${index}:${rule}`).toBe(0);
    }
    const evidenceDir = process.env.PARAGRAPH_EVIDENCE_DIR;
    if (evidenceDir) {
      mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
      writeFileSync(path.join(evidenceDir, 'synthetic-paragraphs.pdf'), buffer, { mode: 0o600 });
    }
  });
});
