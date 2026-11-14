/**
 * デザイン 1e（継続見出し）・1g（習熟度 3 段）・spec（ウェイト 400 / 700）を、実際に描いた PDF の
 * 色・太さ・文字列で固定する。jsdom ではフォントも pdfjs も使えないので node 環境で測る（AGENTS.md）。
 *
 * pdfjs の text 層は色を持たないため、オペレーターリストから「文字を描いた時点の塗り色」と
 * 「線を引いた時点の線色・線幅」を読む。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block } from '@/db/block';

import PDF_FONT_FAMILY from './constant';
import { buildPdfQualityFixtureBlocks, PDF_QUALITY_FIXTURE_TITLE } from './fixture/print-quality-fixture';
import { splitForHyphenation } from './font';
import { buildPrintSkillSheetDocument } from './print-document';
import { DEFAULT_QUALITY_OPTIONS } from './print-quality';
import { PRINT_COLOR, PRINT_WEIGHT } from './print-token';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'font');
const REGULAR_TTF = path.join(FONTS_DIR, 'noto-sans-jp-regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'noto-sans-jp-bold.ttf');
const REFERENCE_MONTH = 24321;

interface DrawnText {
  text: string;
  fill: string;
  y: number;
}
interface DrawnStroke {
  color: string;
  width: number;
}
interface PageOps {
  texts: DrawnText[];
  strokes: DrawnStroke[];
}

/** pdfjs が報告する線幅は、描いた線の 2 倍（枠線は線の内側をクリップして描くため）。 */
const STROKE_WIDTH_SCALE = 2;

/** 各ページで、文字を描いた時点の塗り色と、線を引いた時点の線色・線幅を集める。 */
async function readOps(buffer: Buffer): Promise<PageOps[]> {
  const { getDocument, OPS, Util } = await import('pdfjs-dist');
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const result: PageOps[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const { fnArray, argsArray } = await page.getOperatorList();
    const texts: DrawnText[] = [];
    const strokes: DrawnStroke[] = [];
    let fill = '';
    let stroke = '';
    let lineWidth = 1;
    let matrix: number[] = [1, 0, 0, 1, 0, 0];
    let textMatrix: number[] = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    for (let k = 0; k < fnArray.length; k++) {
      const args = argsArray[k];
      switch (fnArray[k]) {
        case OPS.save:
          stack.push(matrix);
          break;
        case OPS.restore:
          matrix = stack.pop() ?? matrix;
          break;
        case OPS.transform:
          matrix = Util.transform(matrix, args as number[]);
          break;
        case OPS.beginText:
          textMatrix = [1, 0, 0, 1, 0, 0];
          break;
        case OPS.setTextMatrix:
          textMatrix = args as number[];
          break;
        case OPS.moveText:
          textMatrix = Util.transform([1, 0, 0, 1, args[0], args[1]], textMatrix);
          break;
        case OPS.setFillRGBColor:
          fill = Util.makeHexColor(args[0], args[1], args[2]).toLowerCase();
          break;
        case OPS.setStrokeRGBColor:
          stroke = Util.makeHexColor(args[0], args[1], args[2]).toLowerCase();
          break;
        case OPS.setLineWidth:
          lineWidth = args[0] as number;
          break;
        case OPS.stroke:
        case OPS.closeStroke:
          strokes.push({ color: stroke, width: lineWidth / STROKE_WIDTH_SCALE });
          break;
        case OPS.showText: {
          const glyphs = args[0] as Array<{ unicode?: string } | number>;
          const text = glyphs.map((g) => (typeof g === 'object' ? (g.unicode ?? '') : '')).join('');
          texts.push({ text, fill, y: Util.transform(matrix, textMatrix)[5] });
          break;
        }
        default:
          break;
      }
    }
    result.push({ texts, strokes });
  }
  return result;
}

/** 継続見出しは `contentTop`（842 - 42）より上に絶対配置される。そこにある文字だけを返す。 */
function headerTexts(page: PageOps): DrawnText[] {
  return page.texts.filter((t) => t.y > DEFAULT_QUALITY_OPTIONS.contentTop && t.text.trim() !== '');
}

async function embeddedFontNames(buffer: Buffer): Promise<string[]> {
  const text = buffer.toString('latin1');
  return [...text.matchAll(/\/FontName\s*\/([A-Za-z0-9+_-]+)/g)].map((m) => m[1]);
}

function skillBlocks(): Block[] {
  return [
    {
      id: 's1',
      type: 'skills',
      order: 0,
      data: {
        category: '言語',
        skills: [
          { name: 'TypeScript', years: 8, level: '上級' },
          { name: 'Python', years: 4, level: '中級' },
          { name: 'Kotlin', years: 1, level: '初級' },
        ],
      },
    },
  ] as Block[];
}

describe('デザインどおりの PDF（継続見出し・習熟度・ウェイト）', () => {
  let fixtureOps: PageOps[];
  let skillOps: PageOps[];
  let fixtureBuffer: Buffer;

  beforeAll(async () => {
    if (!existsSync(REGULAR_TTF) || !existsSync(BOLD_TTF)) throw new Error(`fonts not found under ${FONTS_DIR}`);
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
    fixtureBuffer = await renderToBuffer(
      await buildPrintSkillSheetDocument({
        title: PDF_QUALITY_FIXTURE_TITLE,
        blocks: buildPdfQualityFixtureBlocks(),
        referenceMonth: REFERENCE_MONTH,
      }),
    );
    fixtureOps = await readOps(fixtureBuffer);
    const skillBuffer = await renderToBuffer(
      await buildPrintSkillSheetDocument({ title: '習熟度', blocks: skillBlocks(), referenceMonth: REFERENCE_MONTH }),
    );
    skillOps = await readOps(skillBuffer);
  }, 120_000);

  it('継続見出しは「会社 ／ 案件名 （続き）」で、3 トーン（accent / label / text）に塗り分ける', () => {
    const pages = fixtureOps.map(headerTexts).filter((texts) => texts.some((t) => t.text.includes('／')));
    expect(pages.length, '会社と案件が両方続くページがフィクスチャに無い').toBeGreaterThan(0);
    for (const texts of pages) {
      const chars = texts.flatMap((t) => [...t.text].map((ch) => ({ ch, fill: t.fill })));
      const line = chars.map((c) => c.ch).join('');
      expect(line).toMatch(/ ／ /);
      expect(line).toMatch(/ （続き）$/);
      expect(line).not.toContain('つづき');
      const fillsOf = (needle: string) => {
        const at = line.lastIndexOf(needle);
        return new Set(chars.slice(at, at + needle.length).map((c) => c.fill));
      };
      expect(fillsOf('／')).toEqual(new Set([PRINT_COLOR.label.toLowerCase()]));
      expect(fillsOf('（続き）')).toEqual(new Set([PRINT_COLOR.label.toLowerCase()]));
      expect(chars[0].fill).toBe(PRINT_COLOR.accent.toLowerCase());
      const sepAt = line.indexOf(' ／ ');
      const projectChars = chars.slice(sepAt + 3, line.length - ' （続き）'.length);
      expect(projectChars.length).toBeGreaterThan(0);
      expect(new Set(projectChars.map((c) => c.fill))).toEqual(new Set([PRINT_COLOR.text.toLowerCase()]));
    }
  });

  it('1 行の「つづき」と「続き」の混在が無い（会社だけが続くときは「つづき」のみ）', () => {
    for (const page of fixtureOps) {
      const line = headerTexts(page)
        .map((t) => t.text)
        .join('');
      expect(line.includes('つづき') && line.includes('続き')).toBe(false);
    }
  });

  it('level モードの習熟度は 3 段（上級=塗り / 中級=accent 太枠 / 初級=灰の細枠）で描き分ける', () => {
    const strokes = skillOps.flatMap((p) => p.strokes);
    const widthsOf = (color: string) => strokes.filter((s) => s.color === color).map((s) => s.width);
    const accentWidths = widthsOf(PRINT_COLOR.accent.toLowerCase());
    expect(
      accentWidths.some((w) => Math.abs(w - 1.25) < 0.01),
      '中級の accent 太枠 1.25pt が無い',
    ).toBe(true);
    expect(
      widthsOf(PRINT_COLOR.rule.toLowerCase()).some((w) => Math.abs(w - 0.75) < 0.01),
      '初級の灰細枠が無い',
    ).toBe(true);
    const filled = skillOps.flatMap((p) => p.texts).filter((t) => t.fill === PRINT_COLOR.paper.toLowerCase());
    expect(filled.some((t) => t.text.includes('TypeScript'))).toBe(true);
    const legend = skillOps.flatMap((p) => p.texts.map((t) => t.text)).join('');
    expect(legend).toContain('中級');
    expect(legend).toContain('初級');
    expect(legend).not.toContain('中級・初級');
  });

  it('ウェイトは 400 と 700 の 2 つだけで、埋め込みフォントも Regular と Bold の 2 本', async () => {
    expect(Object.values(PRINT_WEIGHT).sort()).toEqual([400, 700]);
    const names = new Set((await embeddedFontNames(fixtureBuffer)).map((n) => n.replace(/^[A-Z]{6}\+/, '')));
    expect(names.size).toBe(2);
  });
});
