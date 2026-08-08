import { existsSync } from 'node:fs';
import path from 'node:path';

import { Font, renderToBuffer, View } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { beforeAll, describe, expect, it } from 'vitest';

import { MARKDOWN_REMARK_PLUGINS } from '@/lib/markdown-config';

import PDF_FONT_FAMILY from './constants';
import { splitForHyphenation } from './fonts';
import type { MdNode } from './skill-sheet-document';
import { renderBlocks, SkillSheetDocument } from './skill-sheet-document';

// public/ 配下の実フォントファイルへの絶対パス。
// 本番（pdf/fonts.ts）はブラウザ向けに URL 参照（/fonts/...）で登録するが、
// Node 上のバイト描画ではファイルシステムから読めないため、ここでは実ファイルパスで登録する。
// ファミリ名は本番と同じ PDF_FONT_FAMILY を使うので、コンポーネントの参照と一致する。
//
// Noto Sans JP の CFF(OTF) 版を使うと @react-pdf/renderer の CFF サブセット化が
// 壊れて豆腐表示・コンテンツ消失が起きる（Issue #172）。テストも TrueType 版を使う。
const FONTS_DIR = path.resolve(process.cwd(), 'public', 'fonts');
const REGULAR_TTF = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const BOLD_TTF = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

// PDF の先頭マジックバイト（%PDF-）。これが無ければ PDF として成立していない。
const PDF_HEADER = '%PDF-';

// 実バイト描画はフォント登録＋レイアウト計算を伴い、単体では 2〜3 秒だが
// スイート全体の並列実行下では既定の 5 秒を超えることがあるため、余裕を持たせる。
const RENDER_TIMEOUT_MS = 30_000;

// PDF バッファからテキストを抽出する。Issue #172 の回帰防止で、生成された PDF に
// 期待した日本語テキストが実際に含まれているかを検証するため使う。
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pages = await extractPdfTextByPage(buffer);
  return pages.join('');
}

// ページ境界を保持したままテキストを抽出する。extractPdfText() は全ページを1本の
// 文字列に結合するため、あるカードの見出しが N ページ末尾・末尾段落が N+1 ページ先頭に
// 分かれて描画されても、結合後の文字列では単に隣接して見えてしまい「同一カード内で
// 分断されていないか」を検証できない（Issue #194 の実際の症状はページ分割そのものであり、
// codex レビューでこの盲点を指摘された）。ページ境界をまたいでいないかを検証したい
// 呼び出し元は、この配列上でどのページ番号に現れるかを直接比較すること。
async function extractPdfTextByPage(buffer: Buffer): Promise<string[]> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if ('str' in item && typeof item.str === 'string') {
        text += item.str;
      }
    }
    pages.push(text);
  }
  return pages;
}

// normalizeExtractedText 済みの needle が最初に現れるページ番号（0始まり）。見つからなければ -1。
function findPageIndexOf(pages: string[], needle: string): number {
  const target = normalizeExtractedText(needle);
  return pages.findIndex((page) => normalizeExtractedText(page).includes(target));
}

// splitForHyphenation は CJK 文字境界に ZWNBSP（表示幅ゼロ）を挟んで改行点を作るため、
// PDF自体の見た目には影響しないが、pdf.js の getTextContent() はこの境界を独立した
// テキストアイテムとして抽出し、アイテム間に空白を挿入することがある（抽出テキストの
// アーティファクトであり、実際にPDF上に空白グリフが描画されるわけではない）。
// 内容の欠落やハイフン混入を検証する目的では本質的でないため、比較前に空白を除去する。
function normalizeExtractedText(text: string): string {
  return text.replace(/\s+/g, '');
}

function registerNodeFonts(): void {
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: REGULAR_TTF, fontWeight: 400 },
      { src: BOLD_TTF, fontWeight: 700 },
      // 日本語に true italic は無いため、italic にも同じ字形を割り当てる（本番 fonts.ts と同じ方針）。
      { src: REGULAR_TTF, fontWeight: 400, fontStyle: 'italic' },
      { src: BOLD_TTF, fontWeight: 700, fontStyle: 'italic' },
    ],
  });
  // 本番の registerPdfFonts()（pdf/fonts.ts）はブラウザ向け URL でフォント登録するため
  // Node のバイト描画では再利用できないが、CJK折り返し用の hyphenationCallback は
  // フォントパスと無関係なので同じ実装を登録する。これを登録しないと
  // splitForHyphenation() が一切使われず、CJK折り返しに関する回帰テストが本番の
  // 改行ロジックを検証できていなかった（このテストファイルの既存の盲点）。
  if (typeof Font.registerHyphenationCallback === 'function') {
    Font.registerHyphenationCallback(splitForHyphenation);
  }
}

// 日本語見出し・段落・テーブル・日本語入りコードブロックを含み、
// かつ複数ページに跨る程度の分量を持つ決定的なスキルシート Markdown。
function buildContent(): string {
  const skillRows = Array.from({ length: 40 }, (_, i) => `| 技術${i} | ${i}年 | 業務利用 |`).join('\n');
  const projects = Array.from(
    { length: 6 },
    (_, i) =>
      `\n### ■ プロジェクト${i + 1}\n\n大規模Webアプリケーションの設計・開発を担当しました。\n\n- 要件定義から運用までを一貫して担当\n- パフォーマンス改善で表示速度を改善\n`,
  ).join('\n');

  return [
    '## 概要',
    '',
    'フルスタックエンジニアとして、日本語のスキルシートを **PDF** に変換します。',
    '',
    '## スキル一覧',
    '',
    '| 技術 | 経験年数 | 習熟度 |',
    '| :--- | :--- | :--- |',
    skillRows,
    '',
    '## コード例（日本語コメント込み）',
    '',
    // フェンス付きコードブロック内に日本語を含めることで、P1-4 の tofu（文字化け）回帰を防ぐ。
    '```ts',
    'const 担当者 = "山田太郎"; // 担当者の氏名',
    'function 計算する(金額: number): number {',
    '  // 税込み金額を返す（消費税10%）',
    '  return Math.floor(金額 * 1.1);',
    '}',
    '```',
    '',
    '## 職務経歴',
    projects,
    '',
  ].join('\n');
}

// SkillSheetDocument 本体と同じ remark パイプラインで markdown を mdast ノード列に変換する。
// renderBlocks の構造検証テストで、コンポーネントと同じ木を組み立てるために使う。
function parseMarkdown(content: string): MdNode[] {
  const processor = unified().use(remarkParse).use(MARKDOWN_REMARK_PLUGINS);
  const tree = processor.runSync(processor.parse(content)) as unknown as MdNode;
  return tree.children ?? [];
}

// React 要素木（@react-pdf/renderer のプレーンな element オブジェクト）を再帰的にたどり、
// Text の中身（文字列）だけを連結して取り出す。実際の描画エンジンを介さず、
// renderBlocks が返す木を直接検証するために使う。
function flattenText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    return flattenText((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

// N行の項目/内容テーブルを持つ、実際の projectBlockToMarkdown / skillsBlockToMarkdown
// が生成する形（見出し + 直後の表）に近い小さな案件カード風 markdown を組み立てる。
function buildCardMarkdown(heading: string, rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, i) => `| 項目${i} | 内容${i} |`).join('\n');
  return [heading, '', '| 項目 | 内容 |', '| :--- | :--- |', rows, ''].join('\n');
}

// projectBlockToMarkdown が実際に出す形（見出し→表→会社概要文→**業務内容**→本文→
// **習得スキル・実績**→本文、全て paragraph）に近い案件カードを組み立てる。
function buildProjectCardMarkdown(heading: string, note: string, duties: string, acquired: string): string {
  return [
    buildCardMarkdown(heading, 4),
    note,
    '',
    '**業務内容**',
    '',
    duties,
    '',
    '**習得スキル・実績**',
    '',
    acquired,
    '',
  ].join('\n');
}

describe('renderBlocks（見出し+表の結合 wrap 制御の構造検証）', () => {
  it('1ページに収まる見込みの小さな表（案件カード相当）は見出し+表を1つのViewにまとめ wrap={false} にする', () => {
    // projectBlockToMarkdown 相当（期間/役割/規模/技術スタック/担当工程 程度で最大6行前後）を想定した
    // 小さな表。CARD_MAX_ROWS を下回るため、見出し+表がまとめて分割不可になるべき。
    const nodes = parseMarkdown(buildCardMarkdown('### 株式会社テスト — テストシステム開発', 4));
    const rendered = renderBlocks(nodes) as unknown[];

    // 見出し+表が1つの要素にまとめられ、他の兄弟が無いため出力は1要素のみになる。
    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as {
      type: unknown;
      props: { wrap?: boolean; minPresenceAhead?: number; children: unknown[] };
    };

    expect(merged.type).toBe(View);
    // 1ページに収まる見込みなので分割不可（wrap=false）でまとめられている。
    expect(merged.props.wrap).toBe(false);
    // 見出し単独でページ末尾に残らないよう minPresenceAhead が設定されている。
    expect(merged.props.minPresenceAhead).toBeGreaterThan(0);
    // 見出しと表の2要素が1つの View の子としてまとまっている。
    expect(Array.isArray(merged.props.children)).toBe(true);
    expect(merged.props.children).toHaveLength(2);

    const text = flattenText(merged);
    expect(text).toContain('株式会社テスト — テストシステム開発');
    expect(text).toContain('内容0');
  });

  it('1ページに収まらない見込みの表（行数が多いスキルカテゴリ相当）は wrap={true} のままクリップを防ぐ', () => {
    // CARD_MAX_ROWS を超える行数の表。文字数自体は短くても行数超過で
    // 「収まらない見込み」と判定され、見出し+表を丸ごと不可分にはしない
    // （renderTable 内の行単位 wrap 制御に委ねてクリップを防ぐ）。
    const nodes = parseMarkdown(buildCardMarkdown('### 多い項目のカテゴリ', 20));
    const rendered = renderBlocks(nodes) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as {
      type: unknown;
      props: { wrap?: boolean; minPresenceAhead?: number; children: unknown[] };
    };

    expect(merged.type).toBe(View);
    // 収まらない見込みなので分割を許容する（wrap=true）。
    expect(merged.props.wrap).toBe(true);
    // 収まらない場合でも見出し単独残留を防ぐ minPresenceAhead は維持される。
    expect(merged.props.minPresenceAhead).toBeGreaterThan(0);
    expect(merged.props.children).toHaveLength(2);
  });

  it('見出しの直後が表でない場合（通常の段落など）は結合せず、見出しを単独描画する', () => {
    const nodes = parseMarkdown(['## 概要', '', '通常の説明文です。', ''].join('\n'));
    const rendered = renderBlocks(nodes) as unknown[];

    // 見出しと段落、それぞれ独立した要素として出力される（結合されない）。
    expect(rendered).toHaveLength(2);
    const heading = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown } };
    expect(heading.type).toBe(View);
    // 表と結合されていないので wrap は明示設定されない（結合ケースのように boolean が入らない）。
    expect(heading.props.wrap).toBeUndefined();
  });

  it('表の直後に続く会社概要文・業務内容・習得スキル・実績も同じ分割制御単位にまとめる（Issue #194）', () => {
    const nodes = parseMarkdown(
      buildProjectCardMarkdown(
        '### 株式会社テスト — テストシステム開発',
        '会社概要文です。',
        '業務内容の本文。',
        '習得スキルの本文。',
      ),
    );
    const rendered = renderBlocks(nodes) as unknown[];

    // 見出し+表+後続3段落が1つの要素にまとまる（他の兄弟が無いため出力は1要素のみ）。
    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as {
      type: unknown;
      props: { wrap?: boolean; minPresenceAhead?: number; children: unknown[] };
    };
    expect(merged.type).toBe(View);
    // 表4行+短い段落3つは CARD_TOTAL_CHAR_LIMIT を大きく下回るので分割不可（wrap=false）。
    expect(merged.props.wrap).toBe(false);
    // 見出し+表(2) + 後続段落5つ（会社概要文 / 「業務内容」見出し / 本文 /
    // 「習得スキル・実績」見出し / 本文。太字見出しも独立した paragraph になる）= 7要素。
    expect(merged.props.children).toHaveLength(7);

    const text = flattenText(merged);
    expect(text).toContain('会社概要文です。');
    expect(text).toContain('業務内容の本文。');
    expect(text).toContain('習得スキルの本文。');
  });

  it('業務内容・習得スキルが箇条書き（list）でも同じ分割制御単位にまとめる（chatgpt-codex-connector レビュー指摘: paragraph 限定だとリストで途切れていた）', () => {
    // duties/acquired はユーザーの自由記述で、Markdown の箇条書き（- item）になりうる。
    // mdast 上では paragraph ではなく list ノードになるため、paragraph だけを集める旧実装
    // では表直後の会社概要文までしか収まらず、箇条書きの本体（業務内容・習得スキル）が
    // 別の分割単位に外れて見出し+表とは別ページに漏れうる。
    const nodes = parseMarkdown(
      buildProjectCardMarkdown(
        '### 株式会社テスト — 箇条書き案件',
        '会社概要文です。',
        '- 要件定義\n- 設計\n- 実装',
        '- Docker\n- Kubernetes',
      ),
    );
    const rendered = renderBlocks(nodes) as unknown[];

    // 見出し+表+後続内容（段落・見出しラベル・リスト2つ）が1つの要素にまとまる。
    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as {
      type: unknown;
      props: { wrap?: boolean; minPresenceAhead?: number; children: unknown[] };
    };
    expect(merged.type).toBe(View);
    expect(merged.props.wrap).toBe(false);
    // 見出し+表(2) + 会社概要文(1) + 「業務内容」見出し(1) + list(1) +
    // 「習得スキル・実績」見出し(1) + list(1) = 7要素。
    expect(merged.props.children).toHaveLength(7);

    const text = flattenText(merged);
    expect(text).toContain('会社概要文です。');
    expect(text).toContain('要件定義');
    expect(text).toContain('Kubernetes');
  });

  // chatgpt-codex-connector レビュー指摘: primary の表だけに課していた行単位のチェック
  // （CARD_MAX_ROWS / ROW_UNBREAKABLE_CHAR_LIMIT）が trailing 中の表・リストには
  // 及んでおらず、短い項目/セルが多数並ぶケースでは合計文字数だけ閾値内に収まり
  // 誤って wrap={false}（分割不可）になりクリップしうる欠陥があった。
  it('trailing のリスト項目数が多い場合は合計文字数が閾値内でも wrap={true} のままにする（trailing 版 #147/#172 再発防止）', () => {
    const manyShortItems = Array.from({ length: 8 }, (_, i) => `- 項目${i}`).join('\n');
    const nodes = parseMarkdown(
      buildProjectCardMarkdown('### 株式会社テスト — 項目多数案件', '会社概要文です。', manyShortItems, '短い実績。'),
    );
    const rendered = renderBlocks(nodes) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    // 表4行 + リスト8項目 = 12行相当で CARD_MAX_ROWS(10) を超えるため、
    // 合計文字数（十分に小さい）に関わらず分割を許容する。
    expect(merged.props.wrap).toBe(true);

    const text = flattenText(merged);
    expect(text).toContain('項目0');
    expect(text).toContain('項目7');
    expect(text).toContain('短い実績。');
  });

  it('trailing の表に1行あたりの文字数が閾値を超える行がある場合は wrap={true} のままにする（trailing 版 #147/#172 再発防止）', () => {
    const oversizedRow = `| 項目 | ${'あ'.repeat(650)} |`;
    const trailingTable = ['| 項目 | 内容 |', '| :--- | :--- |', oversizedRow].join('\n');
    const nodes = parseMarkdown(
      buildProjectCardMarkdown('### 株式会社テスト — 長大セル案件', '会社概要文です。', trailingTable, '短い実績。'),
    );
    const rendered = renderBlocks(nodes) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    // trailing の表の1行が ROW_UNBREAKABLE_CHAR_LIMIT を超えるため分割を許容する。
    expect(merged.props.wrap).toBe(true);

    const text = flattenText(merged);
    expect(text).toContain('あ'.repeat(650));
  });

  // chatgpt-codex-connector レビュー指摘: トップレベルの list 項目数だけを数えると、
  // 1項目の中にネストした箇条書きが多数ぶら下がっているケース（見た目は1項目でも
  // renderList は再帰的に全ネスト項目を描画する）で行数チェックをすり抜け、合計文字数も
  // 閾値内に収まって誤って wrap={false} になりうる欠陥があった。
  it('trailing のリストがトップレベル1項目でもネストした項目数が多ければ wrap={true} のままにする（ネストリスト版 #147/#172 再発防止）', () => {
    const nestedItems = Array.from({ length: 10 }, (_, i) => `  - サブ項目${i}`).join('\n');
    const nestedList = `- 案件A\n${nestedItems}`;
    const nodes = parseMarkdown(
      buildProjectCardMarkdown('### 株式会社テスト — ネストリスト案件', '会社概要文です。', nestedList, '短い実績。'),
    );
    const rendered = renderBlocks(nodes) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    // 表4行 + トップレベル項目自身(1) + ネスト項目10 = 15行相当で CARD_MAX_ROWS(10) を超える。
    expect(merged.props.wrap).toBe(true);

    const text = flattenText(merged);
    expect(text).toContain('案件A');
    expect(text).toContain('サブ項目0');
    expect(text).toContain('サブ項目9');
  });

  it('カード全体の合計文字数が大きすぎる場合は wrap={true} のままクリップを防ぐ（Issue #147/#172 の再発防止）', () => {
    const longParagraph = '長文段落です。'.repeat(200); // 十分に長い段落
    const nodes = parseMarkdown(
      buildProjectCardMarkdown('### 株式会社テスト — 長文案件', longParagraph, longParagraph, longParagraph),
    );
    const rendered = renderBlocks(nodes) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    // 合計文字数が閾値を超えるため分割を許容する（内容のクリップを防ぐ）。
    expect(merged.props.wrap).toBe(true);
    expect(merged.props.children).toHaveLength(7);
  });
});

describe('renderBlocks（案件カード実バイト描画・Issue #194）', () => {
  beforeAll(() => {
    registerNodeFonts();
  });

  it(
    '案件カード3件が実際にページ境界をまたがず1ページに収まる（実データで確認した Issue #194 の症状の回帰防止）',
    async () => {
      // Issue #194 で報告された3件のカード（M社/B社/P社）と同じ「見出し+短い表+3段落」の
      // 形を複数積んで、ページ境界付近に配置されたカードが分割されないことを確認する。
      // 20件分のフル描画+全ページ抽出は既定の5秒タイムアウトを超えうる（他の実バイト描画
      // テストと同じ RENDER_TIMEOUT_MS を明示しないと、CI の並列実行下でフレーキーになる。
      // CodeRabbit レビュー指摘）。
      const cards = Array.from({ length: 20 }, (_, i) =>
        buildProjectCardMarkdown(
          `### 会社${i} — 案件${i}の開発`,
          `会社${i}の概要文です。`,
          `案件${i}の業務内容の本文です。要件定義から運用まで担当しました。`,
          `案件${i}で得た習得スキルの本文です。`,
        ),
      ).join('\n');
      const content = ['## 職務経歴', '', cards].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const pages = await extractPdfTextByPage(buffer);
      const rawText = pages.join('');
      const text = normalizeExtractedText(rawText);

      for (let i = 0; i < 20; i++) {
        const heading = `会社${i}—案件${i}の開発`;
        const acquired = `案件${i}で得た習得スキルの本文です。`;
        const headingIndex = text.indexOf(heading);
        const acquiredIndex = text.indexOf(acquired);
        expect(headingIndex).toBeGreaterThanOrEqual(0);
        expect(acquiredIndex).toBeGreaterThan(headingIndex);
        // 見出しから習得スキル本文までの間に含まれる「会社N—案件Nの開発」形の見出しは
        // 自分自身の1件だけであること（＝別カードの見出しが割り込んでいない＝分断されていない）。
        const between = text.slice(headingIndex, acquiredIndex);
        const headingsInBetween = between.match(/会社\d+—案件\d+の開発/g) ?? [];
        expect(headingsInBetween).toEqual([heading]);

        // 上記の連結テキストでの隣接チェックだけでは、見出しがページ末尾・習得スキル本文が
        // 次ページ先頭に分かれて描画されるケース（#194 の実際の症状そのもの）を見逃す。
        // 結合前の pages 配列上で、見出しと習得スキル本文が同一ページに乗っているかを直接見る
        // （chatgpt-codex-connector レビュー指摘: 旧実装は全ページ結合後の文字列しか見ておらず
        // ページ分割そのものを検知できなかった）。
        const headingPage = findPageIndexOf(pages, heading);
        const acquiredPage = findPageIndexOf(pages, acquired);
        expect(headingPage).toBeGreaterThanOrEqual(0);
        expect(acquiredPage).toBe(headingPage);
      }
    },
    RENDER_TIMEOUT_MS,
  );
});

describe('SkillSheetDocument（実バイト描画）', () => {
  beforeAll(() => {
    // 実ファイルが無いと描画は成立しないため前提を明示する。
    expect(existsSync(REGULAR_TTF)).toBe(true);
    expect(existsSync(BOLD_TTF)).toBe(true);
    registerNodeFonts();
  });

  it(
    '登録済み Noto Sans JP で日本語入りコードを含む非空の %PDF バッファを描画できる',
    async () => {
      const buffer = await renderToBuffer(
        <SkillSheetDocument title="山田太郎 スキルシート" content={buildContent()} />,
      );

      // 非空であること。
      expect(buffer.length).toBeGreaterThan(0);
      // PDF として成立していること（先頭が %PDF-）。
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      // 末尾に PDF の終端マーカー（%%EOF）があり、途中で壊れていないこと。
      expect(buffer.subarray(-1024).toString('latin1')).toContain('%%EOF');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '同一入力に対して決定的に %PDF バッファを描画する（2回とも成立）',
    async () => {
      const content = buildContent();
      const first = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const second = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);

      for (const buffer of [first, second]) {
        expect(buffer.length).toBeGreaterThan(0);
        expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      }
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '2行の小さい表に1ページ超の長文セルを含む内容でも正常な PDF バッファを生成できる（行アトミック化の回帰防止）',
    async () => {
      // 表全体は wrap={true}、行は原則 wrap={false}（1行の途中でページを割らない）。
      // ただし1ページに収まらない見込みの行（文字数が閾値超）だけは wrap={true} にして
      // 複数ページにまたがることを許容する（さもないと内容がクリップされる — chatgpt-codex-connector指摘の回帰防止）。
      const longCell = Array.from({ length: 50 }, (_, i) => `行${i + 1}：長い業務内容の説明テキストです。`).join('\n');
      const content = `## 業務詳細\n\n| 項目 | 内容 |\n| :--- | :--- |\n| 主な業務 | ${longCell} |\n| 補足 | 追加情報 |\n`;

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      expect(buffer.subarray(-1024).toString('latin1')).toContain('%%EOF');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '多列テーブル＋長い未分割トークン(URL)を含む内容でもスローせず描画できる（セルの overflow:hidden 回帰防止）',
    async () => {
      // 8列テーブル＋URLのような区切り文字のない長いトークンは、修正前は
      // 折返し後の最終行がセル境界を超えて隣列へ視覚的にはみ出していた
      // （PDFをラスタライズして実際に確認済み）。tableCell に overflow: 'hidden'
      // を追加し、セル幅内にクリップされるよう修正した。
      const header = '| 列A | 列B | 列C | 列D | 列E | 列F | 列G | 列H |';
      const sep = '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |';
      const row =
        '| https://example.com/very/long/unbroken/url/path/xxxxxxxxxxxxxxxxxxxxxxxxxx | b | c | d | e | f | g | h |';
      const content = ['## 多列テーブル', '', header, sep, row, ''].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '表セル内のリンクはクリック注釈(/URI)を生成しない（隣セルへの不可視クリック領域漏れ防止）',
    async () => {
      // 表セル内の <Link> はセル幅で clip されず、クリック注釈が隣セル上に不可視のまま漏れる。
      // セル内リンクは注釈なしの Text として描画するため、PDF バイト列にセル内 URL の
      // /URI 注釈が現れないことを固定する。対照として段落内リンクは注釈が現れる。
      // 注釈オブジェクトは非圧縮でバイト列に平文で出るため URL 部分文字列で判定できる。
      const CELL_URL = 'https://example.com/annot-in-cell-marker';
      const PARA_URL = 'https://example.com/annot-in-para-marker';
      const content = [
        '## リンク注釈テスト',
        '',
        `段落内のリンク: [サイト](${PARA_URL})`,
        '',
        '| 参照 | 備考 |',
        '| :--- | :--- |',
        `| [ドキュメント](${CELL_URL}) | 補足 |`,
        '',
      ].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const bytes = buffer.toString('latin1');

      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      // 段落内リンクは <Link> のまま → /URI 注釈に URL が平文で出る。
      expect(bytes).toContain('annot-in-para-marker');
      // セル内リンクは Text 描画 → 注釈が出ないため URL はバイト列に現れない。
      expect(bytes).not.toContain('annot-in-cell-marker');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '32件の案件カード（見出し+表）を含む実データ相当のボリュームでも、全件のテキストがPDFに描画される（Issue #172 回帰防止）',
    async () => {
      // projectBlockToMarkdown が生成する形（### 会社名 — タイトル 見出し + 直後の
      // 項目/内容 表）を模した案件カードを32件並べる。Issue #172 の再現条件
      // （32件中29件がPDFから消失）に近いボリュームで、全てのカードがテキストとして
      // 抽出できることを検証する。
      const headings = Array.from({ length: 32 }, (_, i) => `株式会社サンプル${i} — 案件${i}のシステム開発`);
      const cards = headings
        .map((heading, i) =>
          [
            `### ${heading}`,
            '',
            '| 項目 | 内容 |',
            '| :--- | :--- |',
            `| 期間 | 202${i % 5}.04〜202${(i % 5) + 1}.03 |`,
            '| 役割 | エンジニア |',
            '| 規模・スコープ | 5名 |',
            '| 技術スタック | TypeScript, React, Next.js |',
            '| 担当工程 | 要件定義, 設計, 実装, テスト |',
            '',
            '**業務内容**',
            '',
            '要件定義から運用までを一貫して担当しました。',
            '',
          ].join('\n'),
        )
        .join('\n');
      const content = ['## 職務経歴', '', cards].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const bytes = buffer.toString('latin1');

      expect(buffer.length).toBeGreaterThan(0);
      expect(bytes.slice(0, PDF_HEADER.length)).toBe(PDF_HEADER);
      expect(bytes.slice(-1024)).toContain('%%EOF');
      // 32件の案件カードは1ページに収まらない分量のため、複数ページに分かれて
      // いることを確認する（/Type /Page の出現数で概算。/Type /Pages とは区別する）。
      const pageObjectCount = (bytes.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
      expect(pageObjectCount).toBeGreaterThan(1);

      // 全 32 件の見出しテキストが PDF から抽出できること（Issue #172 回帰防止）。
      const text = normalizeExtractedText(await extractPdfText(buffer));
      for (const heading of headings) {
        expect(text).toContain(normalizeExtractedText(heading));
      }
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '6カテゴリ中2つが行数超過（15行以上）のスキル一覧でもクラッシュせず正常なPDFを生成できる（スキル表のページ境界分断防止の回帰確認）',
    async () => {
      // skillsBlockToMarkdown が生成する形（### カテゴリ名 見出し + 直後のスキル表）を
      // 6カテゴリ分並べ、うち2カテゴリだけ CARD_MAX_ROWS を超える行数にして
      // Issue #147 (c) の再現条件（6カテゴリ中2つでページ境界分断）に近いボリュームにする。
      const buildCategory = (name: string, rowCount: number) => {
        const rows = Array.from({ length: rowCount }, (_, i) => `| ${name}${i} | ${i}年 | 業務利用 |`).join('\n');
        return [`### ${name}`, '', '| スキル | 経験年数 | 習熟度 |', '| :--- | :--- | :--- |', rows, ''].join('\n');
      };
      const categories = [
        buildCategory('プログラミング言語', 25),
        buildCategory('フレームワーク', 6),
        buildCategory('データベース', 5),
        buildCategory('インフラ', 20),
        buildCategory('ツール', 4),
        buildCategory('その他', 3),
      ].join('\n');
      const content = ['## スキル一覧', '', categories].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const bytes = buffer.toString('latin1');

      expect(buffer.length).toBeGreaterThan(0);
      expect(bytes.slice(0, PDF_HEADER.length)).toBe(PDF_HEADER);
      expect(bytes.slice(-1024)).toContain('%%EOF');
      const pageObjectCount = (bytes.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
      expect(pageObjectCount).toBeGreaterThan(1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '狭い列幅で日本語が複数行に折り返されても、CJK文字間に想定外のハイフン(-)が挿入されない（Issue #171 Codexレビュー指摘の回帰防止）',
    async () => {
      // 8列テーブルの各セルへ、区切りの無い長い日本語連続文（スペース・句読点なし）を
      // 詰め込み、狭い列幅で頻繁な折り返しを強制する。@react-pdf/textkit の
      // getNodes() は splitForHyphenation() が挟む ZWNBSP の直前の CJK 文字にも
      // hyphenated:true を立てるため、hyphenationPenalty を大きくしていないと
      // K&P改行選択がこの penalty ブレークポイントを選び、breakLines() が実際に
      // ハイフン記号(U+002D)を挿入してしまう（修正前バグの再現条件）。
      const denseJapanese =
        '要件定義から基本設計詳細設計実装単体テスト結合テスト総合テスト運用保守まで一貫して担当し性能改善や障害対応にも従事しました';
      const header = '| 列A | 列B | 列C | 列D | 列E | 列F | 列G | 列H |';
      const sep = '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |';
      const row = `| ${Array.from({ length: 8 }, () => denseJapanese).join(' | ')} |`;
      const content = ['## 折り返し検証', '', header, sep, row, ''].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);

      const rawText = await extractPdfText(buffer);
      const text = normalizeExtractedText(rawText);
      // CJK文字と隣接するASCIIハイフンが無いこと（U+002Dを実際のハイフン挿入として扱う）。
      expect(text).not.toMatch(/[぀-ヿ一-鿿]-|-[぀-ヿ一-鿿]/);
      // ハイフンが混入していないため、空白除去後の抽出テキストに
      // 元の日本語連続文がそのまま含まれているはずである。
      expect(text).toContain(denseJapanese);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'CJK文字境界の改行マーカーがPDFのテキストレイヤーに残らない（レビュー指摘: ZWNBSP(U+FEFF)を使うと改行マーカー自体がテキストとして埋め込まれ、コピー・検索時に不可視文字が混入していた）',
    async () => {
      const denseJapanese =
        '要件定義から基本設計詳細設計実装単体テスト結合テスト総合テスト運用保守まで一貫して担当し性能改善や障害対応にも従事しました';
      const header = '| 列A | 列B | 列C | 列D | 列E | 列F | 列G | 列H |';
      const sep = '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |';
      const row = `| ${Array.from({ length: 8 }, () => denseJapanese).join(' | ')} |`;
      const content = ['## 改行マーカー検証', '', header, sep, row, ''].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const rawText = await extractPdfText(buffer);

      // 空白除去 (normalizeExtractedText) をかける前の生の抽出テキストに、
      // 改行マーカーとして使っていた ZWNBSP（U+FEFF）が literal に残っていないこと。
      expect(rawText).not.toContain('﻿');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    '通常の長文段落がページ／行をまたいで再分割(reflow)されても、句点直後の日本語にハイフンが挿入されない（Issue #203 の再発防止）',
    async () => {
      // Issue #203: テーブルセル（#171 のケース）とは異なり、通常の段落テキストが
      // 長くなってページ境界・行境界をまたいで react-pdf 側に再分割されると、
      // splitForHyphenation() が挟んだ BREAK_MARKER が境界のどちら側に残るかが
      // 揃わず、和文の句点（。）の直後に本物の次シラブルが来て hyphenated:true に
      // なることがあった（DB上の実データ25ページ分で実測・再現済み。
      // apps/web/scripts/repro-203-hyphen.tsx で再検証できる）。
      // この特定の marker 消失は react-pdf 内部のページ割り付けアルゴリズムの
      // 挙動に依存しており、この程度の合成データでは同一の消失を再現できなかった
      // （fix 適用前後どちらでもこのテストは pass する＝reflow 消失そのものの
      // 回帰検知はできていない）。それでも「単一CJK文字の直後には常に非ハイフン化」
      // という fix 後の不変条件そのものは有効な回帰防止になるため、
      // 広めの文書量で一般的な確認として残す。
      // 実データ（Issue #203 の再現に使ったDB上の会社概要文）と同じ形：句点で終わる文の
      // 直後に別の文が続く。案件カード相当（見出し+小さな表+段落）を多数積んで
      // 25ページ前後まで伸ばし、実際にバグが出たページ／行境界をまたぐ再分割を誘発する。
      const sentence =
        'ベンチャー企業にて、WebアプリケーションやECサイトの開発など幅広い案件を担当。フロントエンド・バックエンドの両面で経験を積み、クライアントワークの基礎を確立。';
      const card = (i: number) =>
        [
          `### ■ 会社${i} — プロジェクト${i}`,
          '',
          '| 期間 | 役割 |',
          '| :--- | :--- |',
          `| 2020-0${(i % 9) + 1} | エンジニア |`,
          '',
          Array.from({ length: 6 }, () => sentence).join(''),
          '',
        ].join('\n');
      const content = ['## 職務要約', '', Array.from({ length: 20 }, (_, i) => card(i)).join('\n'), ''].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);

      const rawText = await extractPdfText(buffer);
      const text = normalizeExtractedText(rawText);
      // CJK文字（句読点含む）と隣接するASCIIハイフンが無いこと。
      expect(text).not.toMatch(/[぀-ヿ一-鿿、。]-|-[぀-ヿ一-鿿、。]/);
    },
    RENDER_TIMEOUT_MS,
  );
});
