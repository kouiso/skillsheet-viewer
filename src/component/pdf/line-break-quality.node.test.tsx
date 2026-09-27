/**
 * 改行の崩れの規則検査（Issue #392）。
 *
 * ここにあるのは 2 種類の確かめ。
 * - `checkLineBreakQuality` に「各規則にわざと当たる座標」を渡して当たることを確かめる
 *   （合成の行・座標。描画は通さない）。
 * - 現行の印刷コードで描いた PDF に当たりが 0 件であることを確かめる
 *   （小さな合成ブロックで描いたものと、`REAL_BLOCKS_JSON` がある時だけ実データ）。
 *   #388 直前の印刷コード（a7be1c0）で同じ合成ブロックを描くと当たりが出ることは
 *   ローカルで確かめてある（実行ログは PR #392 の本文参照）。
 *
 * 毎朝の検査（pdf-layout-check.yml）がこのファイルを `vitest.config.pdf.ts` 経由で拾う。
 * 実データのテストが落ちたとき公開ログへ出すのは規則ごとの件数だけなので、
 * 件数を `PDF_LAYOUT_COUNTS` という印の行として出す（本文は出さない）。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block } from '@/db/block';
import { currentMonthKey } from '@/db/derived-display';
import PDF_FONT_FAMILY from './constant';
import { splitForHyphenation } from './font';
import { FONT_SIZE, LINE_HEIGHT, PAGE } from './layout-metric';
import { checkLineBreakQuality, LINE_BREAK_RULES, summarizeLineBreaks } from './line-break-quality';
import { buildPrintSkillSheetDocument } from './print-document';
import type { QualityItem, QualityPage } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'font');
const REGULAR_TTF = path.join(FONTS_DIR, 'noto-sans-jp-regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'noto-sans-jp-bold.ttf');

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;
const monthInput = process.env.PRINT_REFERENCE_MONTH;
const referenceMonth = monthInput === undefined ? currentMonthKey() : Number(monthInput);

// 合成の行は「左端 44・右端 551.28・本文 10.5pt・行送り 1.6 倍」の版面に置く。
const BODY = FONT_SIZE.BODY;
const LEFT = PAGE.PADDING_HORIZONTAL;
const RIGHT = PAGE.WIDTH - PAGE.PADDING_HORIZONTAL;
const PITCH = BODY * LINE_HEIGHT;

/** テキストを 1 つのアイテムとして行に置く。幅は指定が無ければ文字数×size（em 幅）。 */
function item(text: string, x: number, y: number, width?: number, size: number = BODY): QualityItem {
  return { text, size, x, y, width: width ?? [...text].length * size };
}

/** 行テキストと右端だけを指定して、行を 1 アイテムで作る。 */
function lineAt(text: string, y: number, right: number, x = LEFT, size: number = BODY): QualityItem {
  return item(text, x, y, right - x, size);
}

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

describe('checkLineBreakQuality: 規則ごとの当たり', () => {
  it('行末の余白: 段落の途中で右端が 2 字以上空き、次行先頭がそこに入ると当たる', () => {
    const page: QualityPage = [
      lineAt('途中で切れた行', 800, 240),
      lineAt('次の行は先頭から埋まる。', 800 - PITCH, RIGHT),
      lineAt('段落の終わり。', 800 - PITCH * 2, 300),
    ];
    const report = checkLineBreakQuality([page]);
    expect(report.counts['early-break']).toBe(1);
    expect(report.hits['early-break']).toEqual([{ page: 1, line: 1 }]);
  });

  it('行末の余白: 余白が 2 字未満の通常の折り返しには当たらない', () => {
    const page: QualityPage = [
      lineAt('右端まで埋まった行です', 800, RIGHT),
      lineAt('続きの行も右端まで埋まる', 800 - PITCH, RIGHT - 5),
      lineAt('段落の終わり。', 800 - PITCH * 2, 300),
    ];
    const report = checkLineBreakQuality([page]);
    expect(report.counts['early-break']).toBe(0);
    expect(report.counts['runt-line']).toBe(0);
  });

  it('英数字の途中: 英数字で終わる行の次が英数字で始まると当たる', () => {
    const page: QualityPage = [
      lineAt('技術名の途中で切れTypeScr', 800, RIGHT),
      lineAt('iptの残りが続く行です。', 800 - PITCH, RIGHT - 10),
    ];
    const report = checkLineBreakQuality([page]);
    expect(report.counts['mid-alnum-break']).toBe(1);
    expect(report.hits['mid-alnum-break']).toEqual([{ page: 1, line: 1 }]);
  });

  it('英数字の途中: splitLongRun の意図的な分割点では当たらない', () => {
    const page: QualityPage = [
      lineAt('abcdefghijklmnop', 800, RIGHT),
      lineAt('qrstuvwxyzABCDEFです。', 800 - PITCH, 300),
    ];
    const report = checkLineBreakQuality([page]);
    expect(report.counts['mid-alnum-break']).toBe(0);
  });

  it('短い最後の行: 最終行が 1〜2 字の段落で当たる', () => {
    const page: QualityPage = [lineAt('本文が右端まで埋まって続く行', 800, RIGHT), lineAt('た。', 800 - PITCH, 100)];
    const report = checkLineBreakQuality([page]);
    expect(report.counts['runt-line']).toBe(1);
    expect(report.hits['runt-line']).toEqual([{ page: 1, line: 2 }]);
  });

  it('禁則: 行末の開き括弧と行頭の句点で当たる', () => {
    const page: QualityPage = [
      lineAt('括弧が行末に残る「', 800, RIGHT),
      lineAt('。句点が行頭に来る行', 800 - PITCH, 300),
      lineAt('段落の終わり。', 800 - PITCH * 2, 300),
    ];
    const report = checkLineBreakQuality([page]);
    expect(report.counts.kinsoku).toBe(2);
  });

  it('長すぎる段落: 改行を含まない段落が 137 字を超えると当たる', () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      lineAt('あいうえおかきくけこさしすせそ', 800 - PITCH * i, i === 9 ? 300 : RIGHT),
    );
    const report = checkLineBreakQuality([lines]);
    expect(report.counts['long-paragraph']).toBe(1);
    expect(report.hits['long-paragraph']).toEqual([{ page: 1, line: 1 }]);
  });

  it('長すぎる段落: 段落の切れ目で切れ、見出しサイズは対象外', () => {
    const heading = [lineAt('あいうえお'.repeat(16), 800, RIGHT, LEFT, FONT_SIZE.H3)];
    const bodyLines = Array.from({ length: 5 }, (_, i) =>
      lineAt('あいうえおかきくけこさしすせそ', 700 - PITCH * i, RIGHT - 10),
    );
    const report = checkLineBreakQuality([[...heading, ...bodyLines]]);
    expect(report.counts['long-paragraph']).toBe(0);
  });

  it('はみ出し: 版面の右端を超えた文字で当たる', () => {
    const page: QualityPage = [item('はみ出た文字', 540, 800, 30)];
    const report = checkLineBreakQuality([page]);
    expect(report.counts.overflow).toBe(1);
    expect(report.hits.overflow).toEqual([{ page: 1, line: 1 }]);
  });

  it('こぼれ: 段落の最終行だけが次の頁に来ると数える（fail 対象ではない）', () => {
    const page1: QualityPage = [
      lineAt('本文が右端まで埋まって続く行です', 800, RIGHT),
      lineAt('まだ埋まって続いている行ですよ', 800 - PITCH, RIGHT),
    ];
    const page2: QualityPage = [lineAt('こぼれた行です。', 800, 300)];
    const report = checkLineBreakQuality([page1, page2]);
    expect(report.counts['page-spill']).toBe(1);
    expect(report.hits['page-spill']).toEqual([{ page: 2, line: 1 }]);
  });
});

/**
 * PR の CI で描く合成ブロック。実データの中身は一切使わず、「和文と ASCII が混じる
 * 段落」と「箇条書き」だけを持つ。各段落は 137 字以内（長すぎる段落は別の規則の
 * 当たりになるため、ここでは混ぜない）。
 *
 * a7be1c0（#388 直前）の印刷コードで描くと「行末の余白」と「英数字の途中」に
 * 当たりが出ることを確かめてある。
 */
function buildLineBreakCheckBlocks(): Block[] {
  const duties = [
    '・TypeScript と Next.js を使い、画面の描画速度を計測しながら改修を進めた。',
    '・PostgreSQL の索引を見直し、検索の応答時間を約半分に短縮した。',
    '・レビューの観点を整理し、チーム全体の実装品質のばらつきを減らした。',
  ].join('\n');
  // 空白を挟む和文の段落。修正前の折り返しは右端に 2 字以上の余白を残して
  // 折り返すことがあり（a7be1c0 で早期改行が出ることを確認済み）、
  // 現行の印刷コードでは右端まで埋まる。
  const acquired =
    '既存のシステムを TypeScript と Next.js で作り直し、画面の描画速度を計測しながら改修を進めた。' +
    'PostgreSQL の索引を見直して検索の応答時間を約半分に短縮し、レビューの観点も整理した。';
  const comment =
    'この案件を通じて、技術的な意思決定を自分の言葉で説明できるようになったことが収穫だった。' +
    'GraphQL のスキーマ設計では REST API との差分を整理し、CI での検査も整えた。';
  return [
    {
      id: 'line-break-check-profile',
      order: 0,
      type: 'profile',
      data: {
        name: '検査 太郎',
        title: '検査用エンジニア',
        company: '検査株式会社',
        pr: '改行規則の検査に使う短い自己紹介です。',
        strengths: ['検査'],
        meta: {},
      },
    },
    {
      id: 'line-break-check-project',
      order: 1,
      type: 'project',
      data: {
        companies: [{ id: 'line-break-check-company', name: '検査会社', kind: '', period: '', note: '' }],
        items: [
          {
            id: 'line-break-check-item',
            companyId: 'line-break-check-company',
            title: '改行検査用の案件',
            period: '2025.01 — 2025.06',
            role: 'SE',
            team: '',
            scope: '',
            process: [],
            tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
            duties,
            acquired,
            comment,
          },
        ],
      },
    },
  ];
}

describe('checkLineBreakQuality: 描いた PDF に当てる', () => {
  it('合成ブロックを現行の印刷コードで描いた PDF では規則の当たりが 0 件', { timeout: 60_000 }, async () => {
    const blocks = buildLineBreakCheckBlocks();
    const buffer = await renderToBuffer(
      await buildPrintSkillSheetDocument({ title: '改行規則の検査', blocks, referenceMonth }),
    );
    const pages = await extractQualityPages(buffer);
    const report = checkLineBreakQuality(pages, { sourceTexts: [JSON.stringify(blocks)] });
    console.log(`PDF_LAYOUT_COUNTS ${summarizeLineBreaks(report)}`);
    for (const rule of LINE_BREAK_RULES) {
      expect(report.counts[rule], `改行の崩れが検出されました: ${rule}`).toBe(0);
    }
  });

  it.skipIf(REAL_BLOCKS_JSON === undefined)(
    '実データを描いた PDF では規則の当たりが 0 件（毎朝の検査の実効ゲート）',
    { timeout: 60_000 },
    async () => {
      if (REAL_BLOCKS_JSON === undefined || !existsSync(REAL_BLOCKS_JSON)) {
        throw new Error('REAL_BLOCKS_JSON の実データファイルがありません');
      }
      const parsed: unknown = JSON.parse(readFileSync(REAL_BLOCKS_JSON, 'utf-8'));
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('REAL_BLOCKS_JSON は空でないブロック配列を指定してください');
      }
      const blocks = parsed as Block[];
      const buffer = await renderToBuffer(
        await buildPrintSkillSheetDocument({ title: 'エンジニアスキルシート', blocks, referenceMonth }),
      );
      const pages = await extractQualityPages(buffer);
      const report = checkLineBreakQuality(pages, { sourceTexts: [JSON.stringify(blocks)] });
      // 公開ログに出せるのは件数だけ。本文や位置の文字列は出さない。
      console.log(`PDF_LAYOUT_COUNTS ${summarizeLineBreaks(report)}`);
      for (const rule of LINE_BREAK_RULES) {
        expect(report.counts[rule], `改行の崩れが検出されました: ${rule}`).toBe(0);
      }
    },
  );
});
