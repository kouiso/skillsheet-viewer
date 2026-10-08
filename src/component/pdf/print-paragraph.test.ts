import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { PDF_REMARK_PLUGINS } from '@/lib/markdown-config';
import { type MdNode, markdownPieces } from './print-markdown';
import { readableParagraphs } from './print-paragraph';

const processor = unified().use(remarkParse).use(PDF_REMARK_PLUGINS);
const paragraph = (source: string) =>
  (processor.runSync(processor.parse(source)) as unknown as MdNode).children?.[0] as MdNode;
const textOf = (node: MdNode): string => node.children?.map(textOf).join('') ?? node.value ?? '';
// Observe the actual measured-route pieces; no production source dictionary API.
const displayParagraphTexts = (text: string) =>
  markdownPieces(text)
    .filter((piece) => piece.displayParagraphGroup)
    .map((piece) => piece.displayParagraphText ?? '');

const sentence = '業務の課題を整理し、担当者と確認した内容に基づいて検証を行い、対応結果を記録しました。';

describe('PDF display paragraphs', () => {
  it('does not let invisible tags or interstitial spaces disguise a two-character fragment', () => {
    const source = `${'あ'.repeat(129)}。<b> あ </b>。${'あ'.repeat(200)}`;
    const pieces = readableParagraphs(paragraph(source)).map(textOf);
    expect(pieces.join('')).toBe(textOf(paragraph(source)));
    expect(pieces.every((piece) => [...piece.replace(/<[^>]*>/g, '').replace(/\s/gu, '')].length > 2)).toBe(true);
  });
  it('gives each field a distinct display paragraph identity even when text and local keys repeat', () => {
    const source = sentence.repeat(6);
    const first = markdownPieces(source);
    const second = markdownPieces(source);
    expect(first[0].displayParagraphGroup).toBe(first[1].displayParagraphGroup);
    expect(first[0].displayParagraphGroup).not.toBe(second[0].displayParagraphGroup);
  });
  it('counts visible prose rather than long invisible HTML attributes without changing the AST', () => {
    const source = `<span data-synthetic="${'x'.repeat(200)}">あ。</span>${sentence.repeat(3)}`;
    const original = paragraph(source);
    const snapshot = JSON.stringify(original);
    const pieces = readableParagraphs(original);
    expect(pieces.map(textOf).join('')).toBe(textOf(original));
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(
      pieces.every(
        (piece) =>
          [
            ...textOf(piece)
              .replace(/<[^>]*>/g, '')
              .trim(),
          ].length > 2,
      ),
    ).toBe(true);
    const short = `<span data-synthetic="${'x'.repeat(200)}">${sentence}</span>`;
    expect(readableParagraphs(paragraph(short))).toEqual([paragraph(short)]);
  });
  it('never isolates a two-character sentence in the middle of prose', () => {
    const source = `${'あ'.repeat(129)}。あ。${'あ'.repeat(200)}`;
    const pieces = readableParagraphs(paragraph(source)).map(textOf);
    expect(pieces.join('')).toBe(source);
    expect(pieces.every((piece) => [...piece.trim()].length > 2)).toBe(true);
  });

  it('keeps Japanese bracket variants and double-quoted prose intact', () => {
    for (const [open, close] of [
      ['"', '"'],
      ['‘', '’'],
      ['[', ']'],
      ['{', '}'],
      ['｢', '｣'],
      ['《', '》'],
      ['〈', '〉'],
      ['〔', '〕'],
      ['〖', '〗'],
      ['«', '»'],
      ['〝', '〟'],
      ['［', '］'],
      ['｛', '｝'],
      ['〘', '〙'],
      ['〚', '〛'],
    ]) {
      const source = open + sentence.repeat(3) + close;
      expect(readableParagraphs(paragraph(source)).map(textOf)).toEqual([source]);
      const surrounding = sentence.repeat(2) + source + sentence.repeat(2);
      const pieces = readableParagraphs(paragraph(surrounding)).map(textOf);
      expect(pieces.join('')).toBe(surrounding);
      expect(pieces.some((piece) => piece.includes(source))).toBe(true);
    }
  });
  it('gives long prose breathing room at existing sentence endings, preserving every character', () => {
    const source = sentence.repeat(6);
    const result = readableParagraphs(paragraph(source));
    expect(result.map(textOf)).toEqual([sentence.repeat(2), sentence.repeat(2), sentence.repeat(2)]);
    expect(result.map(textOf).join('')).toBe(source);
  });

  it('keeps a short paragraph and a long unpunctuated sentence unchanged', () => {
    for (const source of [sentence, '長い文を途中で切断しない'.repeat(30)]) {
      const original = paragraph(source);
      expect(readableParagraphs(original)).toEqual([original]);
    }
  });

  it('preserves authored line breaks instead of adding paragraphs with a blank leading line', () => {
    const source = Array.from({ length: 8 }, () => `・${sentence}`).join('\n');
    const original = paragraph(source);
    expect(readableParagraphs(original)).toEqual([original]);
    expect(markdownPieces(source)).toHaveLength(1);
    expect(displayParagraphTexts(source)).toEqual([]);
    const stillLong = `短い行。\n${sentence.repeat(6)}`;
    expect(readableParagraphs(paragraph(stillLong))).toEqual([paragraph(stillLong)]);
    expect(displayParagraphTexts(stillLong)).toEqual([]);
  });

  it('keeps punctuation inside Japanese quotations and brackets attached to its surrounding sentence', () => {
    const quote = `「${sentence.repeat(2)}」という確認内容を記録しました。`;
    const source = sentence.repeat(2) + quote + sentence.repeat(2);
    const texts = readableParagraphs(paragraph(source)).map(textOf);
    expect(texts).toContain(quote);
    expect(texts.join('')).toBe(source);
    expect(texts.some((text) => text.endsWith('「') || text.startsWith('」'))).toBe(false);
  });

  it('retains links and inline code as whole nodes, with their original metadata', () => {
    const source = `${sentence.repeat(2)}[${sentence.repeat(2)}](https://example.test/guide)と\`${sentence}\`を確認しました。${sentence.repeat(2)}`;
    const original = paragraph(source);
    const result = readableParagraphs(original);
    const nodes = result.flatMap((node) => node.children ?? []);
    const link = original.children?.find((node) => node.type === 'link');
    const code = original.children?.find((node) => node.type === 'inlineCode');
    expect(nodes.find((node) => node.type === 'link')).toBe(link);
    expect(nodes.find((node) => node.type === 'inlineCode')).toBe(code);
    expect(result.map(textOf).join('')).toBe(textOf(original));
  });

  it('retains nested emphasis across sentence boundaries and does not mutate the source AST', () => {
    const original = paragraph(`先頭。**${sentence.repeat(5)}**末尾。`);
    const before = structuredClone(original);
    const result = readableParagraphs(original);
    expect(result.map(textOf).join('')).toBe(textOf(original));
    expect(result.filter((node) => node.children?.some((child) => child.type === 'strong')).length).toBeGreaterThan(1);
    expect(original).toEqual(before);
  });

  it('does not promote a split inline emphasis into a new bold heading', () => {
    const pieces = markdownPieces(`${sentence.repeat(2)}**${sentence.repeat(2)}**`);
    expect(pieces).toHaveLength(2);
    // The last paragraph consists of an inline emphasis only after splitting. It stays body prose.
    expect((pieces[1].el.props as { children: unknown[] }).children.flat(2)).toEqual([sentence.repeat(2)]);
  });

  it('preserves an explicitly authored bold heading as one heading', () => {
    expect(markdownPieces(`**${sentence.repeat(4)}**`)).toHaveLength(1);
  });

  it('does not split punctuation clusters or leave one punctuation mark as a paragraph', () => {
    const source = `${sentence.repeat(2)}${'検証'.repeat(12)}！？${sentence.repeat(2)}`;
    const texts = readableParagraphs(paragraph(source)).map(textOf);
    expect(texts.join('')).toBe(source);
    expect(texts.some((text) => text.startsWith('？') || text.endsWith('！'))).toBe(false);
    const tinyTail = `${sentence.repeat(3)}。`;
    expect(
      readableParagraphs(paragraph(tinyTail))
        .map(textOf)
        .some((text) => text.trim().length <= 2),
    ).toBe(false);
  });

  it('keeps Unicode surrogate pairs and combining marks intact', () => {
    const source = `${sentence.repeat(2)}検証した記号は𠮷とe\u0301です。${sentence.repeat(2)}`;
    expect(readableParagraphs(paragraph(source)).map(textOf).join('')).toBe(source);
  });

  it('does not detach a combining mark, variation selector or joiner immediately after punctuation', () => {
    for (const modifier of ['\u0301', '\ufe0f', '\u200d']) {
      const source = `${sentence.repeat(2)}${modifier}${sentence.repeat(2)}`;
      const texts = readableParagraphs(paragraph(source)).map(textOf);
      expect(texts.join('')).toBe(source);
      expect(texts.some((text) => text.startsWith(modifier))).toBe(false);
    }
  });

  it('does not change list numbering, nesting, or code blocks into new paragraphs', () => {
    const source = `3. ${sentence.repeat(4)}\n   - 子項目。\n\n\`\`\`text\n${sentence.repeat(4)}\n\`\`\``;
    const tree = processor.runSync(processor.parse(source)) as unknown as MdNode;
    for (const node of tree.children ?? []) expect(readableParagraphs(node)).toEqual([node]);
    expect(markdownPieces(source).filter((piece) => piece.kind === 'bullet')).toHaveLength(2);
  });

  it('collects only actually split prose, excluding list items, table cells, code and bold headings', () => {
    const prose = sentence.repeat(4);
    expect(displayParagraphTexts(`3. ${prose}`)).toEqual([]);
    expect(displayParagraphTexts(`| 項目 | 値 |\n| --- | --- |\n| 検証 | ${prose} |`)).toEqual([]);
    expect(displayParagraphTexts(`**${prose}**`)).toEqual([]);
    expect(displayParagraphTexts(`\`\`\`text\n${prose}\n\`\`\``)).toEqual([]);
    expect(displayParagraphTexts(`> ${prose}`)).toEqual([sentence.repeat(2), sentence.repeat(2)]);
    expect(displayParagraphTexts(prose).join('')).toBe(prose);
  });
});
