/**
 * 改行の規則検査（line-break-check.ts）のテスト。
 *
 * - 合成の行データを純関数へ流して、規則表の各ルールが意図通りに数えられること
 * - 現在の印刷コードで描いた合成文に違反が 0 件であること（CI の実効ゲート）
 * - 実データ（REAL_BLOCKS_JSON）で違反が 0 件であること（毎朝の検査がこれを通す）
 *
 * このファイルは「a7be1c0 系（行版の直し前）にもそのまま置いて赤になる」ことを
 * レビューの証跡として使うため、line-break-fill.node.test.tsx など同じ目的の
 * テストファイルにあとで追加されたヘルパーは import せず、必要な描画準備は
 * このファイル内に持つ（依存が無いので新旧どちらの組版でもそのまま動く）。
 *
 * 文はすべて合成。公開リポジトリなので実データの文は置かない。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Document, Font, Page, renderToBuffer, StyleSheet, Text } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block } from '@/db/block';
import { currentMonthKey } from '@/db/derived-display';

import PDF_FONT_FAMILY from './constant';
import { splitForHyphenation } from './font';
import { checkLineBreakRules, LINE_BREAK_RULES, type LineCheckItem, type LineCheckPage } from './line-break-check';
import { buildPrintSkillSheetDocument } from './print-document';
import { extractQualityPages } from './print-quality-extract.node';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'font');
const REGULAR_TTF = path.join(FONTS_DIR, 'noto-sans-jp-regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'noto-sans-jp-bold.ttf');

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;
const referenceMonth = currentMonthKey(new Date());

if (REAL_BLOCKS_JSON === undefined) {
  console.warn('[line-break-check.node.test.tsx] REAL_BLOCKS_JSON 未設定 — 実データでの改行規則検査はスキップされる。');
}

const FONT_SIZE = 11.5;
const FRAME = { left: 40, right: 555, top: 800, bottom: 46 };

/**
 * 合成行を組み立てる。1 行 = 1 item でよい（検査は行単位の位置と文字種だけを見る）。
 * width を省略すると文字種ごとの概算幅（和文=size、英数字=0.55size）を当てる。
 */
function mkLine(text: string, y: number, opts: { x?: number; width?: number; fontName?: string } = {}): LineCheckItem {
  const estimated = Array.from(text).reduce(
    (sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? FONT_SIZE : FONT_SIZE * 0.55),
    0,
  );
  return {
    text,
    size: FONT_SIZE,
    x: opts.x ?? FRAME.left,
    y,
    width: opts.width ?? estimated,
    fontName: opts.fontName,
  };
}

/** 各行 1 item のページを組み立てる（y は本文の中だけを使う）。 */
function mkPage(lines: LineCheckItem[]): LineCheckPage {
  return lines;
}

const zeroCounts = Object.fromEntries(LINE_BREAK_RULES.map((rule) => [rule, 0]));

describe('改行の規則検査（合成データ）', () => {
  it('行末の余白: 段落の途中で 2 字以上空けて折り返した行を数える', () => {
    // 3 行の段落。1 行目だけが欄の右端（555）より 2 字以上手前で折れている。
    // 2 行目は実際の抽出結果と同じく文字単位の item にして、次の行の先頭単位の幅を
    // 現実の値（和文 1 字 = size）で測れるようにする。
    const page = mkPage([
      mkLine('あいうえおかきくけこさしすせそ', 760, { width: 460 }),
      ...['ま', 'みむめもやゆよわをんがぎぐげご'].map((t, i) => ({
        text: t,
        size: FONT_SIZE,
        x: i === 0 ? FRAME.left : FRAME.left + FONT_SIZE,
        y: 740,
        width: i === 0 ? FONT_SIZE : 555 - FONT_SIZE - FRAME.left,
      })),
      mkLine('ざじずぜぞだ', 720, { width: 120 }),
    ]);
    const result = checkLineBreakRules([page]);
    expect(result.counts['trailing-gap']).toBe(1);
    expect(result.failingCount).toBe(1);
    expect(result.violations).toEqual([{ rule: 'trailing-gap', page: 1, lineIndex: 0 }]);
    // 段落の最後の行が短いのは普通なので、余白では数えない（このデータの 3 行目）。
    expect(result.counts['runt-last-line']).toBe(0);
  });

  it('英数字の途中: 英数字で終わる行の次が英数字で始まると数える（16 字を超える連なりの強制改行は除く）', () => {
    const bad = mkPage([
      mkLine('先頭は和文で末がアルファベットxyzabc', 760, { width: 515 }),
      mkLine('defと和文が続く文', 740, { width: 400 }),
      mkLine('おしまいの行です', 720, { width: 150 }),
    ]);
    const result = checkLineBreakRules([bad]);
    expect(result.counts['mid-alnum-run']).toBe(1);

    // 16 字を超える空白なしの連なりは splitLongRun が行幅いっぱいで切るので、違反にしない。
    const forced = mkPage([
      mkLine('あいうえおabcdefghijklmnopqrstuvw', 760, { width: 300 }),
      mkLine('xyzのあとに和文が続いて文は終わる', 740, { width: 300 }),
    ]);
    expect(checkLineBreakRules([forced]).counts['mid-alnum-run']).toBe(0);
  });

  it('短い最後の行: 2 行以上の段落の最後の行が 1〜2 字だと数える', () => {
    const page = mkPage([
      mkLine('段落の本文がここまで続いて折り返される', 760, { width: 515 }),
      mkLine('の。', 740, { width: 23 }),
      mkLine('つぎの段落はここから始まって同じ幅まで並ぶ', 700, { width: 515 }),
      mkLine('きちんと終わる行', 680, { width: 200 }),
    ]);
    const result = checkLineBreakRules([page]);
    expect(result.counts['runt-last-line']).toBe(1);
    expect(result.violations).toEqual([{ rule: 'runt-last-line', page: 1, lineIndex: 1 }]);
  });

  it('禁則: 行末の開き括弧・行頭の閉じ括弧や句読点を数える（行頭「.x」は語の途中なので除く）', () => {
    const page = mkPage([
      mkLine('括弧が開いたまま行が終わる（', 760, { width: 515 }),
      mkLine('続きの行です。', 740, { width: 200 }),
      mkLine('行末の句点のあとが一行で続いて折れる。', 700, { width: 515 }),
      mkLine('。次の行の先頭が句点', 680, { width: 300 }),
      mkLine('version', 660, { width: 515 }),
      mkLine('.5 のような行頭ピリオドは語の途中', 640, { width: 400 }),
    ]);
    const result = checkLineBreakRules([page]);
    // （で終わる行末 = 1 件、。で始まる行頭 = 1 件、'.5' は除外
    expect(result.counts.kinsoku).toBe(2);
  });

  it('長すぎる段落: 改行の無い段落が 137 字を超えると数える（太字の見出しは除く）', () => {
    const longLine = 'あいうえおかきくけこさしすせそたちつてと'; // 20 字
    const longParagraph = mkPage(Array.from({ length: 9 }, (_, i) => mkLine(longLine, 760 - i * 20, { width: 500 })));
    const result = checkLineBreakRules([longParagraph]);
    // 9 行の段落 → 最終行を除く 8 行 × 20 字 = 160 字 > 137
    expect(result.counts['long-paragraph']).toBe(1);

    // 全部太字（本文の主フォントと違うフォントだけで構成される段落）は見出しとして除く。
    // 主フォントはページ内の文字数の多い方なので、段落 2 本分の普通の行を添える。
    const bodyLine = 'ふつうの本文の行がここまで続いて折り返される場面を想定した文';
    const boldParagraph = mkPage([
      ...Array.from({ length: 4 }, (_, i) => mkLine(bodyLine, 780 - i * 20, { width: 380, fontName: 'regular' })),
      ...Array.from({ length: 9 }, (_, i) => mkLine(longLine, 680 - i * 20, { width: 460, fontName: 'bold' })),
      ...Array.from({ length: 4 }, (_, i) => mkLine(bodyLine, 460 - i * 20, { width: 380, fontName: 'regular' })),
    ]);
    const boldResult = checkLineBreakRules([boldParagraph]);
    expect(boldResult.counts['long-paragraph']).toBe(0);
    expect(boldResult.failingCount).toBe(0);
  });

  it('はみ出し: 文字の外枠が本文枠の外に出るものを数える（footer 帯は除く）', () => {
    const page = mkPage([
      mkLine('普通の行', 700, { width: 200 }),
      mkLine('右にはみ出した行', 600, { x: 500, width: 80 }),
      mkLine('下にはみ出した行', 40, { width: 200 }),
      mkLine('footerの行', 20, { width: 200 }),
    ]);
    const result = checkLineBreakRules([page]);
    expect(result.counts['frame-overflow']).toBe(2);
  });

  it('ページ跨ぎ: 段落が 1 行だけ次のページへ送られた形を数える（失敗にはしない）', () => {
    const page1 = mkPage([
      mkLine('ページの下まで続く段落の途中の行', 700, { width: 515 }),
      mkLine('ページの下まで続く段落の行で下端に達する', 50, { width: 515 }),
    ]);
    const page2 = mkPage([mkLine('ページをまたいだ最後の行', 780, { width: 300 })]);
    const result = checkLineBreakRules([page1, page2]);
    expect(result.counts['page-spill']).toBe(1);
    expect(result.failingCount).toBe(0);
  });

  it('どのルールにも当たらない段落は 0 件になる', () => {
    const page = mkPage([
      mkLine('きちんと折り返された行が続く普通の段落です。', 760, { width: 515 }),
      mkLine('次の行も同じ幅まで続いて、', 740, { width: 515 }),
      mkLine('最後の行はここで終わる。', 720, { width: 300 }),
    ]);
    const result = checkLineBreakRules([page]);
    expect(result.counts).toEqual(zeroCounts);
    expect(result.failingCount).toBe(0);
  });
});

// ---- 実際に描いた PDF に対する検査 ----

const PAGE_PADDING = 20;
const SWEEP_WIDTHS = Array.from({ length: 36 }, (_, i) => 100 + i * 10);

// 掃引のページは padding=20 なので、検査の枠もそれに合わせる
// （本物のドキュメントは左右 40 の枠で DEFAULT_LINE_CHECK_OPTIONS のまま）。
const SWEEP_OPTIONS = {
  contentLeft: PAGE_PADDING,
  contentRight: 595 - PAGE_PADDING,
  contentTop: 842 - PAGE_PADDING,
  contentBottom: PAGE_PADDING,
  footerReserve: PAGE_PADDING / 2,
  maxParagraphChars: 137,
  maxForcedRunChars: 16,
};

/**
 * 掃引に使う合成文は全部で 137 字以下・段落 1 本に抑えてある
 * （規則 5「長すぎる段落」自体が発動しない形で、各ルールをきれいに通ることを見る）。
 * URL や長い英数字の塊を段落の途中に置くと、行幅いっぱいで切れない塊の都合で
 * 組版側がやむなく余白を残すことがあり、それは検査でも規則通りに数えられるため、
 * きれいに通ることを見る掃引には置かない（余白を残す形は合成データ側の単体テストで見る）。
 */

/** 文字の種類が細かく入れ替わる和文（漢字・かな・カタカナ・英字）。 */
const SCRIPT_MIXED =
  '新しい設定をテスト用のサーバーに置いて動作を確かめてからチームに共有する手順を作った。画面の表示はデザイン案と照らし合わせて差があればメモに残し次の会議で相談した。';

/** 英字の語が和文の中に点在する文。 */
const LATIN_MIXED = '使った技術はAPIの設計とUnitテストの整備で、後から見直せるように手順を文書に残した。';

/** 括弧・数字・16 字を超える英数字の連なり（splitLongRun が切る形）を含む文。 */
const BRACKET_AND_RUN =
  '株式会社では「部署」の名を出さず、abcdefghijklmnopqrstuvwxyzの連なりを置いた文も崩れないことを見た。';

/** 行の途中に半角空白が出る和文。 */
const SPACED_NAMES =
  '確認した画面は UI 案と DB 案と CI 案と QA 案で、それぞれの設定を同じ手順で読み込んでから差分を一覧にまとめて共有しました。';

/** 最後の行が 1〜2 字になりやすい和文。 */
const RUNT_PRONE = 'チームで使う手順書を見直して重複していた項目を整理し、確認の手間を少なくした。';

/** 数字と括弧が混ざる文。 */
const NUMBER_BRACKET = '数字の2024年と記号の「」や（）を混ぜた文で、改行の位置が変に空かないかを見る文。';

/** 幅ごとに 1 ページずつ描いて extractQualityPages に渡す。 */
async function renderSweepPages(text: string, widths: number[]): Promise<LineCheckPage[]> {
  const styles = StyleSheet.create({ page: { padding: PAGE_PADDING } });
  const buffer = await renderToBuffer(
    <Document>
      {widths.map((width) => (
        <Page key={width} size="A4" style={styles.page}>
          <Text style={{ fontFamily: PDF_FONT_FAMILY, fontSize: FONT_SIZE, width }}>{text}</Text>
        </Page>
      ))}
    </Document>,
  );
  return extractQualityPages(buffer);
}

describe('改行の規則検査（描画済み合成文）', () => {
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

  it.each([
    ['文字の種類が入れ替わる文', SCRIPT_MIXED],
    ['英字の語が点在する文', LATIN_MIXED],
    ['括弧と長い連なりを含む文', BRACKET_AND_RUN],
    ['行の途中に空白がある文', SPACED_NAMES],
    ['最後の行が短くなりやすい文', RUNT_PRONE],
    ['数字と括弧が混ざる文', NUMBER_BRACKET],
  ])(
    '現在の印刷コードでは改行規則違反が 0 件（%s）',
    async (_name, text) => {
      const pages = await renderSweepPages(text, SWEEP_WIDTHS);
      const result = checkLineBreakRules(pages, SWEEP_OPTIONS);
      console.log(
        `[line-break:synthetic] ${LINE_BREAK_RULES.map((rule) => `${rule}=${result.counts[rule]}`).join(' ')}`,
      );
      expect(result.failingCount).toBe(0);
    },
    120_000,
  );
});

describe('改行の規則検査（実データ）', () => {
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

  it.skipIf(REAL_BLOCKS_JSON === undefined)(
    '実データで改行の規則違反が 0 件',
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
      const buffer = await renderToBuffer(await buildPrintSkillSheetDocument({ title, blocks, referenceMonth }));
      const pages = await extractQualityPages(buffer);
      const result = checkLineBreakRules(pages);

      // 公開ログへ出すのは件数だけ。本文の文字列は console にも書かない。
      const summary = LINE_BREAK_RULES.map((rule) => `${rule}=${result.counts[rule]}`).join(' ');
      console.log(`[line-break:real] pages=${pages.length} ${summary}`);
      const countsPath = process.env.PDF_LINE_COUNTS_JSON;
      if (countsPath) {
        const testName = expect.getState().currentTestName ?? '実データで改行の規則違反が 0 件';
        writeFileSync(countsPath, JSON.stringify({ [testName]: result.counts }), { mode: 0o600 });
      }
      expect(result.failingCount).toBe(0);
    },
    300_000,
  );
});
