/**
 * 和文の段落の改行位置を、実際に描いた PDF の行で確かめる。
 *
 * - 文字の種類（漢字・かな・カタカナ・英字）が変わる所でも改行できること
 *   （できないと、その手前で改行して行末に数文字ぶんの余白が残る）
 * - 行の途中に半角空白が 2 つ以上あっても、空白の後ろの和文まで行を詰めること
 * - 段落の最後の行が 1〜2 字だけにならないこと
 * - 上の直しで、はみ出し・文字の欠け・禁則が崩れないこと
 *
 * 文はすべて合成。公開リポジトリなので実データの文は置かない。
 * 列幅を 1 つに決め打ちすると「その幅でだけ通る」テストになるので、幅を掃引する。
 * 幅ごとに 1 ページを割り当て、1 回の描画で全部の幅を測る。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Document, Font, Page, renderToBuffer, StyleSheet, Text } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';

import PDF_FONT_FAMILY from './constant';
import { splitForHyphenation } from './font';
import type { QualityPage } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'font');
const REGULAR_TTF = path.join(FONTS_DIR, 'noto-sans-jp-regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'noto-sans-jp-bold.ttf');

const FONT_SIZE = 10;
const PAGE_PADDING = 20;
/** 行末の余白がこれ以上（字数）なら「早すぎる改行」。行の品質検査と同じ 2 字。 */
const EARLY_BREAK_CHARS = 2;
/**
 * 最後から 2 行目だけは 1 字ぶん緩める。最後の行を 3 字以上にするため 1 字を次の行へ
 * 送ることがあり、その 1 字ぶんは意図した余白になる。
 */
const PENULTIMATE_EXTRA_CHARS = 1;

/** 文字の種類が細かく入れ替わる和文（漢字・かな・カタカナ・英字）。 */
const SCRIPT_MIXED =
  '新しい設定をテスト用のサーバーに置いて動作を確かめてからチームに共有する手順を作った。画面の表示はデザイン案と照らし合わせて差があればメモに残し次の会議で相談した。';

/**
 * 行の途中に半角空白が何度も出る和文。空白の後ろにも和文が続く。
 * 英字は 2 字の略語だけにして、どの塊も 2 字ぶんの幅より狭くしてある。こうすると
 * 「次の塊が入らないので改行した」正しい改行でも、余白は必ず 2 字未満になる。
 */
const SPACED_NAMES =
  '確認した画面は UI 案と DB 案と CI 案と QA 案で、それぞれの設定を同じ手順で読み込んでから差分を一覧にまとめて共有しました。';

/** 最後の行が「た。」だけになりやすい和文。 */
const RUNT_PRONE = 'チームで使う手順書を見直して重複していた項目を整理し、確認の手間を少なくした。';

const SWEEP_WIDTHS = Array.from({ length: 36 }, (_, i) => 100 + i * 10);

interface RenderedLine {
  text: string;
  left: number;
  right: number;
}

function toLines(page: QualityPage): RenderedLine[] {
  const rows = new Map<number, QualityPage>();
  for (const item of page) {
    const key = Math.round(item.y * 2) / 2;
    const row = rows.get(key) ?? [];
    row.push(item);
    rows.set(key, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      return {
        text: sorted.map((item) => item.text).join(''),
        left: Math.min(...sorted.map((item) => item.x)),
        right: Math.max(...sorted.map((item) => item.x + item.width)),
      };
    });
}

/** 幅ごとに 1 ページずつ描いて、ページごとの行を返す。 */
async function renderSweep(text: string, widths: number[], fontSize = FONT_SIZE): Promise<RenderedLine[][]> {
  const styles = StyleSheet.create({
    page: { padding: PAGE_PADDING },
  });
  const buffer = await renderToBuffer(
    <Document>
      {widths.map((width) => (
        <Page key={width} size="A4" style={styles.page}>
          <Text style={{ fontFamily: PDF_FONT_FAMILY, fontSize, width }}>{text}</Text>
        </Page>
      ))}
    </Document>,
  );
  const pages = await extractQualityPages(buffer);
  return pages.map(toLines);
}

function visibleLength(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

interface EarlyBreak {
  width: number;
  line: number;
  slackChars: number;
}

function findEarlyBreaks(sweep: RenderedLine[][], widths: number[]): EarlyBreak[] {
  const found: EarlyBreak[] = [];
  sweep.forEach((lines, pageIndex) => {
    const width = widths[pageIndex];
    for (let i = 0; i < lines.length - 1; i++) {
      const slackChars = (PAGE_PADDING + width - lines[i].right) / FONT_SIZE;
      const limit = i === lines.length - 2 ? EARLY_BREAK_CHARS + PENULTIMATE_EXTRA_CHARS : EARLY_BREAK_CHARS;
      if (slackChars >= limit) found.push({ width, line: i + 1, slackChars: Math.round(slackChars * 100) / 100 });
    }
  });
  return found;
}

describe('和文の段落の改行位置', () => {
  beforeAll(() => {
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
  });

  it('文字の種類が変わる所でも改行でき、行末に 2 字以上の余白を残さない', async () => {
    const sweep = await renderSweep(SCRIPT_MIXED, SWEEP_WIDTHS);
    expect(findEarlyBreaks(sweep, SWEEP_WIDTHS)).toEqual([]);
  });

  it('行の途中の半角空白で止まらず、空白の後ろの和文まで行を詰める', async () => {
    const sweep = await renderSweep(SPACED_NAMES, SWEEP_WIDTHS);
    expect(findEarlyBreaks(sweep, SWEEP_WIDTHS)).toEqual([]);
  });

  it('段落の最後の行を 1〜2 字だけにしない', async () => {
    const widths = Array.from({ length: 60 }, (_, i) => 100 + i * 5);
    const sweep = await renderSweep(RUNT_PRONE, widths);
    const runts = sweep.flatMap((lines, pageIndex) => {
      if (lines.length < 2) return [];
      const last = visibleLength(lines[lines.length - 1].text);
      return last <= 2 ? [{ width: widths[pageIndex], last: lines[lines.length - 1].text }] : [];
    });
    expect(runts).toEqual([]);
  });

  describe('直しで崩れないこと（いじわるの例）', () => {
    const HAZARDS: { name: string; text: string; widths: number[]; fontSize?: number }[] = [
      {
        name: '濁点が分かれた仮名（NFD）',
        text: 'か\u3099いこ\u3099を使うテス\u3099トの手順を決めました。',
        widths: SWEEP_WIDTHS,
      },
      {
        name: '長い URL',
        text: '資料は https://example.com/docs/very/long/path/segment/that/keeps/going/index.html に置きました。',
        widths: SWEEP_WIDTHS,
      },
      {
        name: '空白の無い技術名の連結',
        text: '使った言語はTypeScript/JavaScript/Pythonの三つです。',
        widths: SWEEP_WIDTHS,
      },
      { name: '括弧で囲んだ英字', text: '外部の「OpenAI」や「Example」の仕組みを比べました。', widths: SWEEP_WIDTHS },
      { name: '最小幅の表の欄', text: '試作〜検収・点検（全段階）', widths: [44, 50, 60, 70], fontSize: 9 },
      {
        name: '句点の直後の半角ピリオド',
        text: '設定を書き換えた。.config の中身も同じ手順で揃えた。',
        widths: SWEEP_WIDTHS,
      },
    ];

    it.each(HAZARDS)('$name: はみ出さず、文字を失わず、禁則を守る', async ({ text, widths, fontSize }) => {
      expect(await findHazardProblems(text, widths, fontSize)).toEqual([]);
    });

    // 補助面の漢字（U+20000 以上）は、この改行の直しの前から字形が崩れて描かれる（main でも同じ結果を
    // 2026-09-25 に確認。フォントには字形があるので、描画側の問題）。改行の直しとは別の不具合なので、
    // 崩れていることを it.fails で記録しておき、直ったら赤になって気付けるようにする。
    it.fails('補助面の漢字: 文字を失わない（既知の不具合）', async () => {
      const text = '\u{2000B}\u{20B9F}の字を含む名前を表に並べて点検した。';
      expect(await findHazardProblems(text, SWEEP_WIDTHS)).toEqual([]);
    });
  });
});

async function findHazardProblems(text: string, widths: number[], fontSize?: number): Promise<string[]> {
  const sweep = await renderSweep(text, widths, fontSize);
  const problems: string[] = [];
  sweep.forEach((lines, pageIndex) => {
    const width = widths[pageIndex];
    const joined = lines.map((line) => line.text).join('');
    if (joined.replace(/\s+/g, '').normalize('NFC') !== text.replace(/\s+/g, '').normalize('NFC')) {
      problems.push(`${width}: 文字が変わった`);
    }
    lines.forEach((line, i) => {
      if (line.right > PAGE_PADDING + width + 0.5) problems.push(`${width}: ${i + 1} 行目がはみ出した`);
      if (/^[、。）」\u3099]/.test(line.text)) problems.push(`${width}: ${i + 1} 行目の行頭が禁則文字`);
      if (/[（「]$/.test(line.text)) problems.push(`${width}: ${i + 1} 行目の行末が開き括弧`);
    });
  });
  return problems;
}
