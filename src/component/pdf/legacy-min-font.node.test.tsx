// 実 PDF の文字サイズ・全内容・改ページを Node で検査する。jsdom では代替しない。
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist';
import { beforeAll, describe, expect, it } from 'vitest';
import PDF_FONT_FAMILY from './constant';
import { splitForHyphenation } from './font';
import { findBoxOverlaps, type QualityPage } from './print-quality';
import { SkillSheetDocument } from './skill-sheet-document';
import { BOLD_TTF, REGULAR_TTF } from './test-font-path';

const normalize = (text: string) => text.replace(/\s+/g, '');
const tableRows = Array.from({ length: 45 }, (_, i) => [`技術${i}`, `経験${i}年の日本語検証と末尾保持${i}`]);
const longCell = Array.from({ length: 120 }, (_, i) => `セル${i}番の設計実装と日本語の長文を省略せず確認します。`);
const codeLines = Array.from({ length: 110 }, (_, i) => `const 値${i} = ${i}; // 日本語コメント${i}`);
const listLines = ['親の箇条書き', '子の箇条書き', '末尾の箇条書き'];
const cases = [
  {
    name: '本文・引用・リスト・表・コード・フッター',
    content: [
      '## 日本語見出し',
      '段落の全文を保持します。',
      '> 引用の全文を保持します。',
      '- リストの全文を保持します。',
      '本文の `日本語コード` と **太字の内容**。',
      '```ts\nconst 値 = 1; // 日本語のコード\n```',
      '| 技術 | 経験 |\n| --- | --- |',
      ...tableRows.map((row) => `| ${row.join(' | ')} |`),
      '',
      '最後の本文も保持します。',
    ]
      .join('\n\n')
      .replaceAll('|\n\n|', '|\n|'),
    expected: [
      '日本語見出し',
      '段落の全文を保持します。',
      '引用の全文を保持します。',
      'リストの全文を保持します。',
      '本文の日本語コードと太字の内容。',
      'const 値 = 1; // 日本語のコード',
      ...tableRows.flat(),
      '最後の本文も保持します。',
    ],
  },
  {
    name: '単一セルが一ページを超える表',
    content: `## 長い表\n\n| 項目 | 全文 |\n| --- | --- |\n| 内容 | ${longCell.join('')} |\n\n表の後の本文末尾。`,
    expected: [...longCell, '表の後の本文末尾。'],
  },
  {
    name: '複数ページのコードと入れ子リスト',
    content: `## コード\n\n\`\`\`ts\n${codeLines.join('\n')}\n\`\`\`\n\n- ${listLines[0]}\n  - ${listLines[1]}\n- ${listLines[2]}`,
    expected: [...codeLines, ...listLines],
  },
];

beforeAll(() => {
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: REGULAR_TTF, fontWeight: 400 },
      { src: BOLD_TTF, fontWeight: 700 },
      { src: REGULAR_TTF, fontWeight: 400, fontStyle: 'italic' },
    ],
  });
  Font.registerHyphenationCallback(splitForHyphenation);
});

describe('Markdown PDF は本文を削らず全要素を 11pt 以上で出力する', () => {
  it.each(cases)('$name', async ({ content, expected }) => {
    const buffer = await renderToBuffer(<SkillSheetDocument title="合成読みやすさ検証" content={content} />);
    const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
    try {
      expect(doc.numPages).toBeGreaterThan(1);
      let combined = '';
      for (let number = 1; number <= doc.numPages; number++) {
        const page = await doc.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        expect(viewport.width).toBeCloseTo(595.28, 1);
        expect(viewport.height).toBeCloseTo(841.89, 1);
        const text = await page.getTextContent();
        const items = text.items.filter((item) => 'str' in item && item.str.trim().length > 0);
        const quality: QualityPage = [];
        let hasFooter = false;
        for (const item of items) {
          if (!('str' in item)) continue;
          const size = item.height;
          expect(size, `p${number} ${item.str}`).toBeGreaterThanOrEqual(11 - 0.001);
          expect(item.str).not.toContain('\uFFFD');
          const [, , , , x, y] = item.transform;
          if (/^\d+\s*\/\s*\d+$/.test(item.str)) {
            expect(item.str.replace(/\s/g, '')).toBe(`${number}/${doc.numPages}`);
            expect(y).toBeGreaterThan(0);
            expect(size).toBeLessThanOrEqual(12);
            hasFooter = true;
          } else {
            combined += item.str;
            expect(y, `p${number} bottom ${item.str}`).toBeGreaterThanOrEqual(48 - 0.01);
            expect(y + size, `p${number} top ${item.str}`).toBeLessThanOrEqual(841.89 - 40 + 0.01);
            expect(x, `p${number} left ${item.str}`).toBeGreaterThanOrEqual(44 - 0.01);
            expect(x + item.width, `p${number} right ${item.str}`).toBeLessThanOrEqual(595.28 - 44 + 0.01);
            quality.push({ text: item.str, size, x, y, width: item.width });
          }
        }
        expect(hasFooter, `p${number} footer`).toBe(true);
        expect(findBoxOverlaps(quality), `p${number} overlaps`).toEqual([]);
      }
      const actual = normalize(combined);
      let cursor = 0;
      for (const value of expected) {
        const target = normalize(value);
        const found = actual.indexOf(target, cursor);
        expect(found, value).toBeGreaterThanOrEqual(cursor);
        cursor = found + target.length;
      }
    } finally {
      await doc.destroy();
    }
  }, 120_000);
});
