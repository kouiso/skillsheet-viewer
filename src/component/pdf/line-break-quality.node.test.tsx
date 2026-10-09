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
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Block } from '@/db/block';
import { currentMonthKey } from '@/db/derived-display';
import { PDF_REMARK_PLUGINS } from '@/lib/markdown-config';
import PDF_FONT_FAMILY from './constant';
import { splitForHyphenation } from './font';
import { checkLineBreakQuality, LINE_BREAK_RULES, summarizeLineBreaks } from './line-break-quality';
import { buildPrintSkillSheetDocument, type PrintSkillSheetDocumentProps } from './print-document';
import { displayParagraphRegions } from './print-paragraph-region';
import type { QualityItem, QualityPage } from './print-quality';
import { extractQualityPages } from './print-quality-extract.node';
import { PRINT_SIZE, PRINT_TYPE } from './print-token';
import { buildPrintViewModel } from './print-view-model';

const FONTS_DIR = path.resolve(process.cwd(), 'public', 'font');
const REGULAR_TTF = path.join(FONTS_DIR, 'noto-sans-jp-regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'noto-sans-jp-bold.ttf');

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;
const monthInput = process.env.PRINT_REFERENCE_MONTH;
const referenceMonth = monthInput === undefined ? currentMonthKey() : Number(monthInput);

// 合成の行は印刷経路の実版面（左右余白 40・本文 11.5pt・行送り 1.75 倍）に置く。
const BODY = PRINT_TYPE.body.fontSize;
const LEFT = PRINT_SIZE.padHorizontal;
const RIGHT = PRINT_SIZE.pageWidth - PRINT_SIZE.padHorizontal;
const PITCH = BODY * PRINT_TYPE.body.lineHeight;

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
    const heading = [lineAt('あいうえお'.repeat(16), 800, RIGHT, LEFT, PRINT_TYPE.projectTitle.fontSize)];
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
    // 頁またぎ継続は「前頁の同じ列の最下段・頁下端の帯」から次頁上端へ継ぐ
    // 判定なので、前頁の行は本文領域の底近く（y≈46〜86）に置く。
    const page1: QualityPage = [
      lineAt('本文が右端まで埋まって続く行です', 80, RIGHT),
      lineAt('まだ埋まって続いている行ですよ', 80 - PITCH, RIGHT),
    ];
    const page2: QualityPage = [lineAt('こぼれた行です。', 800, 300)];
    const report = checkLineBreakQuality([page1, page2]);
    expect(report.counts['page-spill']).toBe(1);
    expect(report.hits['page-spill']).toEqual([{ page: 2, line: 1 }]);
  });

  it('頁またぎ: 次頁の先頭で複数列が同じ行に並ぶ表ヘッダ再掲は段落に継がない', () => {
    // 実データで出た偽陽性: 継続表のヘッダ行（期間|案件|チーム）が頁の先頭に再掲されると、
    // 前頁の最終行が列の右端まで埋まっているので本文の続きと誤認され、2 字の「期間」が
    // 段落の最終行になり runt-line（とこぼれの偽計上）に当たった。
    const page1: QualityPage = [
      item('頁の終わりまで埋まった本文の行です', 64, 80, RIGHT - 64),
      item('まだ埋まって続いている行ですよね', 64, 80 - PITCH, RIGHT - 64),
    ];
    const page2: QualityPage = [
      item('期間', 64, 800, 2 * BODY),
      item('案件', 152, 800, 2 * BODY),
      item('チーム', 512, 800, 2 * BODY),
      lineAt('ヘッダの次の本文行です。', 800 - PITCH, 300),
    ];
    const report = checkLineBreakQuality([page1, page2]);
    expect(report.counts['runt-line']).toBe(0);
    expect(report.counts['page-spill']).toBe(0);
  });

  it('複数列: 同じ行に並ぶ別の列に紛れても、列ごとの段落を追って当たる', () => {
    // 左列 3 行（1 行目だけ早く切れる）と右列 3 行を行順に並べる。
    // 右列は頁の右端まで届くので、左列の早い改行は「列の右端」に対して計る。
    const page: QualityPage = [
      item('左列の一行目が早く切れ', 40, 800, 120),
      item('右列の長い行は右端まで埋まるテキストです', 300, 800, 240),
      item('左列の続きが右端まで来る', 40, 800 - PITCH, 260),
      item('右列の続きも右端近くまで来るテキストです', 300, 800 - PITCH, 250),
      item('左列の終わり', 40, 800 - PITCH * 2, 150),
      item('右列の終わりのテキストです', 300, 800 - PITCH * 2, 240),
    ];
    const report = checkLineBreakQuality([page]);
    expect(report.counts['early-break']).toBe(1);
    expect(report.hits['early-break']).toEqual([{ page: 1, line: 1 }]);
  });

  it('行末の余白: 段落全体が同じ幅で早く切れても、列の右端との差で当たる', () => {
    // 段落自身の行が全部同じ短さ（段落の最大右端を見る旧実装では見逃す）。
    // 同じ左端の列に右端まで届く別の段落があるので列の右端は 555 になる。
    const page: QualityPage = [
      lineAt('この行は途中で切れてしまいます', 800, 300),
      lineAt('次の行も同じ幅で終わってしまいます', 800 - PITCH, 300),
      lineAt('段落の最後の行です。', 800 - PITCH * 2, 300),
      // 段落の切れ目を行送り＋4pt（ブロック間ギャップと同じ）で作る。
      lineAt('別の段落は右端までしっかり埋まるテキストです', 800 - PITCH * 3 - 4, RIGHT),
    ];
    const report = checkLineBreakQuality([page]);
    expect(report.counts['early-break']).toBe(2);
  });

  it('行末の余白: 空白での折り返しでも、元の文の切れ目単位で判定する', () => {
    const page: QualityPage = [
      lineAt('段落の中で foo', 800, 300),
      lineAt('bar について書きました。', 800 - PITCH, RIGHT),
      lineAt('段落の終わりです。', 800 - PITCH * 2, 300),
    ];
    // `foo bar` は空白で折り返されている。元の文では空白挟みなので、
    // 連続一致ではなく空白許容の照合で境界を見つけ、単位は `bar`。
    const report = checkLineBreakQuality([page], {
      sourceTexts: ['段落の中で foo bar について書きました。段落の終わりです。'],
    });
    expect(report.counts['early-break']).toBe(1);
  });

  it('はみ出し: footer の高さまで流れ込んだ本文を拾い、footer 本文は拾わない', () => {
    const page: QualityPage = [
      item('検査 太郎 ／ 検査シート', 40, 20, 120),
      item('流れ込んだ本文', 40, 25, 120),
      item('12 / 3', 500, 20, 60),
    ];
    const report = checkLineBreakQuality([page], { footerText: '検査 太郎 ／ 検査シート' });
    expect(report.counts.overflow).toBe(1);
    // 行番号は頁内の y 降順の順位。y=25 の本文行が 1 行目。
    expect(report.hits.overflow).toEqual([{ page: 1, line: 1 }]);
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
    'GraphQL のスキーマ設計では REST API との差分を整理し、CI での検査も整えた。' +
    '合成データの検証として、担当範囲と確認した結果を順に説明し、関係者との認識をそろえた。';
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

/**
 * ブロックから文字列フィールドを全部拾う。`JSON.stringify(blocks)` を 1 本の
 * 文字列として渡すと、フィールド境界の `","` をまたいだ一致や `"` の
 * エスケープで元の文との照合がずれるため、実際の本文フィールド単位で渡す。
 */
function collectSourceTexts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectSourceTexts(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectSourceTexts(item, out);
  }
  return out;
}

interface MdNode {
  type?: string;
  value?: string;
  children?: MdNode[];
}

const mdProcessor = unified().use(remarkParse).use(PDF_REMARK_PLUGINS);
/** インライン内容を持つ markdown ノード（描画時に1つの文として流れる単位）。 */
const INLINE_BLOCKS = new Set(['paragraph', 'listItem', 'tableCell', 'heading']);

/**
 * markdown フィールドを、描画後と同じプレーンテキストに平坦化して拾う。
 * `**強調**` やリンクは描画時に記号が消えるので、生のフィールド文字列だけでは
 * 折り返し境界が元の文と一致せず、照合が黙ってスキップされる（レビュー指摘）。
 * print-markdown と同じ `PDF_REMARK_PLUGINS` で parse してから、ブロック単位の
 * インライン文字列にする。
 */
function collectRenderedMarkdownTexts(value: unknown, out: string[] = []): string[] {
  const inlineText = (node: MdNode): string => {
    if (node.children === undefined || node.children.length === 0) return node.value ?? '';
    return node.children.map(inlineText).join('');
  };
  const walk = (node: MdNode): void => {
    if (INLINE_BLOCKS.has(node.type ?? '')) {
      out.push(inlineText(node));
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  if (typeof value === 'string') {
    walk(mdProcessor.runSync(mdProcessor.parse(value)) as MdNode);
  } else if (Array.isArray(value)) {
    for (const item of value) collectRenderedMarkdownTexts(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectRenderedMarkdownTexts(item, out);
  }
  return out;
}

/**
 * 検査に渡す元の文の集合。生フィールド・print view model が変換後に持つ文字列・
 * markdown の描画後テキストの 3 系統を渡す（どれかに当たれば境界を見つけられる）。
 */
function collectPrintSourceTexts(blocks: Block[], title: string): string[] {
  const viewModel = buildPrintViewModel(title, blocks, undefined, referenceMonth);
  return [...collectSourceTexts(blocks), ...collectSourceTexts(viewModel), ...collectRenderedMarkdownTexts(blocks)];
}

/** 抽出した頁から running footer の文字列を拾う（下端帯に出る item の連結）。 */
function footerTextOf(pages: QualityPage[]): string {
  return (pages[0] ?? [])
    .filter((item) => item.y < DEFAULT_FOOTER_RESERVE)
    .map((item) => item.text)
    .join(' ');
}
const DEFAULT_FOOTER_RESERVE = 30;

describe('checkLineBreakQuality: 描いた PDF に当てる', () => {
  it('合成ブロックを現行の印刷コードで描いた PDF では規則の当たりが 0 件', { timeout: 60_000 }, async () => {
    const title = '改行規則の検査';
    const blocks = buildLineBreakCheckBlocks();
    const document = await buildPrintSkillSheetDocument({ title, blocks, referenceMonth });
    const buffer = await renderToBuffer(document);
    const pages = await extractQualityPages(buffer);
    const regions = displayParagraphRegions(
      (document.props as unknown as PrintSkillSheetDocumentProps).projectPages,
      pages.length,
    );
    expect(regions.length).toBeGreaterThan(0);
    const report = checkLineBreakQuality(pages, {
      sourceTexts: collectPrintSourceTexts(blocks, title),
      displayParagraphRegions: displayParagraphRegions(
        (document.props as unknown as PrintSkillSheetDocumentProps).projectPages,
        pages.length,
      ),
      footerText: footerTextOf(pages),
    });
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
      const title = 'エンジニアスキルシート';
      const document = await buildPrintSkillSheetDocument({ title, blocks, referenceMonth });
      const buffer = await renderToBuffer(document);
      const pages = await extractQualityPages(buffer);
      const report = checkLineBreakQuality(pages, {
        sourceTexts: collectPrintSourceTexts(blocks, title),
        displayParagraphRegions: displayParagraphRegions(
          (document.props as unknown as PrintSkillSheetDocumentProps).projectPages,
          pages.length,
        ),
        footerText: footerTextOf(pages),
      });
      // 公開ログに出せるのは件数だけ。本文や位置の文字列は出さない。
      console.log(`PDF_LAYOUT_COUNTS ${summarizeLineBreaks(report)}`);
      for (const rule of LINE_BREAK_RULES) {
        expect(report.counts[rule], `改行の崩れが検出されました: ${rule}`).toBe(0);
      }
    },
  );
});
