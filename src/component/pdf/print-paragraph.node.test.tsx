import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Document, Font, Page, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import PDF_FONT_FAMILY from './constant';
import { splitForHyphenation } from './font';
import { checkLineBreakQuality, LINE_BREAK_RULES } from './line-break-quality';
import { displayParagraphTexts, PrintMarkdown } from './print-markdown';
import { Paragraph, printStyles } from './print-primitive';
import { extractQualityPages } from './print-quality-extract.node';

const sentence = '業務の課題を整理し、担当者と確認した内容に基づいて検証を行い、対応結果を記録しました。';
const compact = (value: string) => value.replace(/\s+/gu, '');

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
  it('uses the actual paragraph end for terminal-line protection, while rejecting a truly early wrap', async () => {
    const first = `${'検'.repeat(86)}完了。`;
    const second = `${'照'.repeat(78)}終了。`;
    const source = first + second;
    const buffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={printStyles.page}>
          <PrintMarkdown text={source} />
        </Page>
      </Document>,
    );
    const pages = await extractQualityPages(buffer);
    // The full field continues beyond the end of the first displayed paragraph.
    // Using it alone mistakes the three-character terminal-line protection for an early wrap.
    expect(checkLineBreakQuality(pages, { sourceTexts: [source] }).counts['early-break']).toBe(1);
    const actualParagraphs = displayParagraphTexts(source);
    expect(actualParagraphs).toEqual([first, second]);
    const corrected = checkLineBreakQuality(pages, { sourceTexts: [source, ...actualParagraphs] });
    for (const rule of LINE_BREAK_RULES) expect(corrected.counts[rule], rule).toBe(0);
    const badWrap = [
      [
        { text: '検'.repeat(20), x: 40, y: 800, width: 230, size: 11.5 },
        { text: '検'.repeat(44), x: 40, y: 779.875, width: 506, size: 11.5 },
        { text: `${'検'.repeat(22)}完了。`, x: 40, y: 759.75, width: 287.5, size: 11.5 },
      ],
    ];
    expect(checkLineBreakQuality(badWrap, { sourceTexts: [source, ...actualParagraphs] }).counts['early-break']).toBe(
      1,
    );
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
            <PrintMarkdown text={item.markdown} />
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
