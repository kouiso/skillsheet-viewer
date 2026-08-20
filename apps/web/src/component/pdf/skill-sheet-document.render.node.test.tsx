// このファイルは vitest.config.pdf.ts（environment: 'node'）側で走る。
// jsdom では renderToBuffer すると別 realm の Uint8Array 判定でフォントサブセットが
// バイトレベルで壊れるため、フォント・グリフ・描画の可視性に関する主張は
// **決して jsdom 側の *.test.tsx に書かないこと。**
// それらの検証は *.node.test.tsx（vitest.config.pdf.ts / environment: 'node'）側で行う。

import { existsSync } from 'node:fs';

import { Font, renderToBuffer, View } from '@react-pdf/renderer';
import { type ProjectBlockData, projectBlockToMarkdown } from '@skillsheet/db';
import { getDocument } from 'pdfjs-dist';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { beforeAll, describe, expect, it } from 'vitest';

import { PDF_REMARK_PLUGINS } from '@/lib/markdown-config';

import PDF_FONT_FAMILY from './constants';
import { splitForHyphenation } from './fonts';
import type { MdNode } from './skill-sheet-document';
import { isCardLikelyToFitOnePage, NUM, renderBlocks, SkillSheetDocument } from './skill-sheet-document';
import { BOLD_TTF, REGULAR_TTF } from './test-font-paths';

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
  const processor = unified().use(remarkParse).use(PDF_REMARK_PLUGINS);
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

// 「このカードは1ページに収まらない」と実装（高さ見積り）が判断するまで要素数を増やす。
// 旧テストは NUM.CARD_MAX_ROWS のような件数の閾値を直接参照していたが、判定が pt 単位の
// 高さ見積りに変わったため、件数ではなく「収まらなくなる件数」を実装に問い合わせて使う。
// こうしておくと、余白やフォントサイズを変えても回帰テストの意味が保たれる。
const SEARCH_LIMIT = 2000;

/** 件数 count のカードを実装（高さ見積り）が「1ページに収まる」と判断するか。 */
function fitsAt(build: (count: number) => string, count: number): boolean {
  const nodes = parseMarkdown(build(count));
  const heading = nodes[0];
  const table = nodes[1];
  if (heading?.type !== 'heading' || table?.type !== 'table') {
    throw new Error('見出し+表で始まる markdown を組み立てること');
  }
  return isCardLikelyToFitOnePage(heading, table, nodes.slice(2));
}

function smallestCountThatOverflowsPage(build: (count: number) => string): number {
  // estimateBlocksHeight は要素を増やしても高さが減らない（行数・行高・余白の和なので
  // count に対して単調非減少）ため、「収まる → 収まらない」の境界はちょうど 1 箇所しかない。
  // 1 ずつ試すと 600 件を超える build まで parseMarkdown が走るので、倍々で「収まらない
  // 件数」を見つけ、そこから二分探索で境界を詰める（評価回数は O(log n)）。
  // low = 収まることを確認済みの件数（0 は未確認の下限）、high = 収まらないことを確認済みの件数。
  let low = 0;
  let high = 1;
  while (fitsAt(build, high)) {
    low = high;
    if (high >= SEARCH_LIMIT) {
      throw new Error(`${SEARCH_LIMIT} 件まで増やしても1ページに収まらない判定にならなかった`);
    }
    high = Math.min(high * 2, SEARCH_LIMIT);
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (fitsAt(build, mid)) low = mid;
    else high = mid;
  }
  return high;
}

describe('renderBlocks（見出し+表の結合 wrap 制御の構造検証）', () => {
  it('1ページに収まる見込みの小さな表（案件カード相当）は見出し+表を1つのViewにまとめ wrap={false} にする', () => {
    // projectBlockToMarkdown 相当（期間/役割/規模/技術スタック/担当工程 程度で最大6行前後）を想定した
    // 小さな表。1ページ分の高さを大きく下回るため、見出し+表がまとめて分割不可になるべき。
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

  it('1ページに収まらない高さの表（行数が多いスキルカテゴリ相当）は wrap={true} のままクリップを防ぐ', () => {
    // 実装の高さ見積りが「収まらない」と言い出す行数まで増やした表。見出し+表を
    // 丸ごと不可分にすると、1ページより大きい分割不可ノードになって中身が消える
    // （Issue #262 の欠落経路）ので、分割を許容していること。
    const rowCount = smallestCountThatOverflowsPage((n) => buildCardMarkdown('### 多い項目のカテゴリ', n));
    const nodes = parseMarkdown(buildCardMarkdown('### 多い項目のカテゴリ', rowCount));
    const rendered = renderBlocks(nodes) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as {
      type: unknown;
      props: { wrap?: boolean; minPresenceAhead?: number; children: unknown[] };
    };

    expect(merged.type).toBe(View);
    // 収まらないので分割を許容する（wrap=true）。
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
    const heading = rendered[0] as { type: unknown; props: { wrap?: boolean; minPresenceAhead?: number } };
    expect(heading.type).toBe(View);
    // 表と結合されていないので wrap は明示設定されない（結合ケースのように boolean が入らない）。
    expect(heading.props.wrap).toBeUndefined();
  });

  // Issue #263 D の回帰防止。旧実装は案件見出し（■接頭辞）のときだけ minPresenceAhead を
  // 設定し、通常の `##` 見出しは 0 だったため、本文と切り離されてページ末尾に取り残された。
  it('■ を持たない通常の見出しにも minPresenceAhead を設定する（Issue #263 D）', () => {
    const plain = parseMarkdown('## 概要\n\n本文。\n') as MdNode[];
    const project = parseMarkdown('## ■ 案件A\n\n本文。\n') as MdNode[];
    const plainHeading = (renderBlocks(plain) as unknown[])[0] as { props: { minPresenceAhead?: number } };
    const projectHeading = (renderBlocks(project) as unknown[])[0] as { props: { minPresenceAhead?: number } };

    expect(plainHeading.props.minPresenceAhead).toBe(NUM.MIN_PRESENCE_HEADING);
    // 案件見出しと同じ扱いになっていること（片方だけ 0 に戻る退行を検出する）。
    expect(plainHeading.props.minPresenceAhead).toBe(projectHeading.props.minPresenceAhead);
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
    // 表4行+短い段落3つは1ページ分の高さを大きく下回るので分割不可（wrap=false）。
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

  // 「表の行」以外の要素（trailing のリスト・表・引用）も高さに数えないと、
  // 短い項目が大量に並ぶカードが誤って wrap={false} になりクリップしうる。
  it('trailing のリスト項目が1ページ分を超えるほど多い場合は wrap={true} のままにする（trailing 版 #147/#172 再発防止）', () => {
    const build = (count: number) =>
      buildProjectCardMarkdown(
        '### 株式会社テスト — 項目多数案件',
        '会社概要文です。',
        Array.from({ length: count }, (_, i) => `- 項目${i}`).join('\n'),
        '短い実績。',
      );
    const itemCount = smallestCountThatOverflowsPage(build);
    const rendered = renderBlocks(parseMarkdown(build(itemCount))) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    // 短い項目でも件数が増えれば高さは 1 ページを超える。合計文字数だけを見ていた
    // 旧実装はここをすり抜けて内容を落としていた。
    expect(merged.props.wrap).toBe(true);

    const text = flattenText(merged);
    expect(text).toContain('項目0');
    expect(text).toContain(`項目${itemCount - 1}`);
    expect(text).toContain('短い実績。');
  });

  it('trailing の表に1ページに収まらない高さの行がある場合は wrap={true} のままにする（trailing 版 #147/#172 再発防止）', () => {
    // 1 行だけで 1 ページを超える高さになるセルを作る（何文字必要かは見積りに聞く）。
    const build = (count: number) =>
      buildProjectCardMarkdown(
        '### 株式会社テスト — 長大セル案件',
        '会社概要文です。',
        ['| 項目 | 内容 |', '| :--- | :--- |', `| 項目 | ${'あ'.repeat(count)} |`].join('\n'),
        '短い実績。',
      );
    const cellLength = smallestCountThatOverflowsPage(build);
    const rendered = renderBlocks(parseMarkdown(build(cellLength))) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    expect(merged.props.wrap).toBe(true);

    const text = flattenText(merged);
    expect(text).toContain('あ'.repeat(cellLength));
  });

  // トップレベルの list 項目数だけを数えると、1項目の中にネストした箇条書きが多数
  // ぶら下がっているケース（見た目は1項目でも renderList は再帰的に全ネスト項目を描画する）
  // を取りこぼす。高さ見積りも同じく再帰的にたどれていること。
  it('trailing のリストがトップレベル1項目でもネストした項目が多ければ wrap={true} のままにする（ネストリスト版 #147/#172 再発防止）', () => {
    const build = (count: number) =>
      buildProjectCardMarkdown(
        '### 株式会社テスト — ネストリスト案件',
        '会社概要文です。',
        `- 案件A\n${Array.from({ length: count }, (_, i) => `  - サブ項目${i}`).join('\n')}`,
        '短い実績。',
      );
    const nestedCount = smallestCountThatOverflowsPage(build);
    const rendered = renderBlocks(parseMarkdown(build(nestedCount))) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    expect(merged.props.wrap).toBe(true);

    const text = flattenText(merged);
    expect(text).toContain('案件A');
    expect(text).toContain('サブ項目0');
    expect(text).toContain(`サブ項目${nestedCount - 1}`);
  });

  // blockquote に入れ子になった表・リストも、描画されるからには高さに数えられていること。
  it('trailing の blockquote に入れ子の表があり行数が多い場合も wrap={true} のままにする（blockquote 版 #147/#172 再発防止）', () => {
    const build = (count: number) =>
      buildProjectCardMarkdown(
        '### 株式会社テスト — 引用表案件',
        '会社概要文です。',
        ['| 項目 | 内容 |', '| :--- | :--- |', ...Array.from({ length: count }, (_, i) => `| 項目${i} | 内容${i} |`)]
          .map((line) => `> ${line}`)
          .join('\n'),
        '短い実績。',
      );
    const rowCount = smallestCountThatOverflowsPage(build);
    const rendered = renderBlocks(parseMarkdown(build(rowCount))) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    expect(merged.props.wrap).toBe(true);

    const text = flattenText(merged);
    expect(text).toContain('項目0');
    expect(text).toContain(`項目${rowCount - 1}`);
  });

  it('カード全体の高さが1ページを超える場合は wrap={true} のままクリップを防ぐ（Issue #147/#172 の再発防止）', () => {
    const longParagraph = '長文段落です。'.repeat(200); // 十分に長い段落
    const nodes = parseMarkdown(
      buildProjectCardMarkdown('### 株式会社テスト — 長文案件', longParagraph, longParagraph, longParagraph),
    );
    const rendered = renderBlocks(nodes) as unknown[];

    expect(rendered).toHaveLength(1);
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean; children: unknown[] } };
    expect(merged.type).toBe(View);
    // 高さが1ページを超えるため分割を許容する（内容の消失を防ぐ）。
    expect(merged.props.wrap).toBe(true);
    expect(merged.props.children).toHaveLength(7);
  });

  // Issue #262 の核心。旧実装は「カード全体の合計文字数 <= 1400」で分割不可を決めていた
  // ため、1 段落 8 文字 × 150 段落 = 1200 文字（実高さ 3000pt 超）が閾値を通過し、
  // 分割不可のまま 1 ページへ押し込まれて本文が丸ごと PDF から消えていた。
  // 文字数ではなく高さで見ていることを、構造レベルでも固定しておく。
  it('短い段落が大量に並ぶカードは合計文字数が小さくても wrap={true} にする（Issue #262）', () => {
    const build = (count: number) =>
      [
        '### 株式会社テスト — 短い段落多数案件',
        '',
        '| 項目 | 内容 |',
        '| :--- | :--- |',
        '| 期間 | 2020-04〜2021-03 |',
        '',
        Array.from({ length: count }, (_, i) => `段落${i}`).join('\n\n'),
        '',
      ].join('\n');
    const paragraphCount = smallestCountThatOverflowsPage(build);
    const nodes = parseMarkdown(build(paragraphCount));
    // 旧実装の閾値（合計 1400 文字）を下回る文字数のまま、高さだけが 1 ページを超える
    // ケースであることを明示する。ここが 1400 文字を超えてしまうと、この回帰テストは
    // 「文字数でも弾ける」ケースになってしまい #262 を守れない。
    const totalChars = nodes.slice(2).reduce((sum, node) => sum + flattenText(renderBlocks([node])).length, 0);
    expect(totalChars).toBeLessThan(1400);

    const rendered = renderBlocks(nodes) as unknown[];
    const merged = rendered[0] as { type: unknown; props: { wrap?: boolean } };
    expect(merged.props.wrap).toBe(true);
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

// #242 の回帰防止。projectBlockToMarkdown が comment を出さず、かつ duties / acquired を
// escape していたため、画面に出ている案件本文と箇条書きが PDF から丸ごと落ちていた。
// markdown 文字列の検査だけでは「PDF のテキスト層に載ったか」までは言えないので、
// 実バイト描画して pdfjs で抽出したテキストで確認する。
describe('projectBlockToMarkdown → PDF テキスト層（Issue #242）', () => {
  beforeAll(() => {
    registerNodeFonts();
  });

  const PROJECT: ProjectBlockData = {
    companies: [
      { id: 'c1', name: 'Q 社', kind: '自社サービス事業会社', period: '2025-11〜現在', note: '会社概要の文' },
    ],
    items: [
      {
        id: 'p1',
        companyId: 'c1',
        title: 'マッチングアプリの開発',
        scope: 'iOS / Android / Web',
        period: '2025-11〜現在',
        role: 'フルスタック',
        team: '13 名',
        tech: { lang: ['TypeScript'], fw: ['React Native'], db: [], infra: [], tools: [], collab: [] },
        process: ['要件定義', '実装'],
        duties: '- モバイルアプリの機能開発\n- バックエンドのクエリ最適化',
        acquired: '- React Native での開発\n- N+1 解消',
        comment: '四つのリポジトリに横断的に関わりました。\n\n**モバイル**\n\n- メッセージ機能を実装\n- 課金演出を実装',
      },
    ],
  };

  it(
    'comment 本文と duties / acquired の箇条書きが PDF のテキスト層に載る',
    async () => {
      const content = projectBlockToMarkdown(PROJECT);

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);

      const text = normalizeExtractedText(await extractPdfText(buffer));
      expect(text).toContain('四つのリポジトリに横断的に関わりました');
      // 箇条書きは「本文が載っているか」だけでは守れない。escape された `\- 項目` も
      // 抽出テキスト上は `- 項目` になり、本文の部分文字列一致は素通りするため。
      // renderList だけが行頭へ `•` を描くので、この記号の有無で
      // 「list ノードとして描かれたか / エスケープされた段落か」を実バイトで判別する。
      expect(text).toContain('•メッセージ機能を実装');
      expect(text).toContain('•モバイルアプリの機能開発');
      expect(text).toContain(`•${'N+1 解消'.replace(/\s/g, '')}`);
      // 会社概要文は素テキスト扱いのままなので、こちらも欠落していないこと。
      // かつ、こちらは list にならない（`•` を伴わない）。
      expect(text).toContain('会社概要の文');
    },
    RENDER_TIMEOUT_MS,
  );

  // #147 / #194 の再発経路。案件カードは「見出し+表とそれに続く自由記述」を1つの
  // 分割不可単位として描くが、自由記述に見出しが混ざるとその走査がそこで打ち切られ、
  // カード自身がページ境界で割れる。blocks.ts 側で見出し記法を落としているので、
  // 実バイト上もカードが1つの単位に収まっていること。
  it(
    '自由記述に見出し記法があっても案件カードが分割単位を保つ',
    async () => {
      const withHeading: ProjectBlockData = {
        companies: PROJECT.companies,
        items: [{ ...PROJECT.items[0], comment: '前置き\n\n### 小見出し\n\n- 箇条書き' }],
      };
      const content = projectBlockToMarkdown(withHeading);
      expect(content.split('\n')).not.toContain('### 小見出し');

      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const text = normalizeExtractedText(await extractPdfText(buffer));
      expect(text).toContain('小見出し');
      expect(text).toContain('•箇条書き');
    },
    RENDER_TIMEOUT_MS,
  );

  // 画面側は rehype-sanitize が javascript:/file: の href を落とすが、PDF の <Link> は
  // そのまま URI アクションになる。自由記述が markdown として通る以上、PDF だけ
  // 素通しだと第三者へ渡す成果物にクリック可能な危険リンクが焼き付く。
  it(
    '自由記述の危険なスキームのリンクを PDF の URI アクションにしない',
    async () => {
      const withLinks: ProjectBlockData = {
        companies: PROJECT.companies,
        items: [
          {
            ...PROJECT.items[0],
            comment: '[報告書](javascript:alert(1)) と [社内](file:///etc/passwd) と [公開](https://example.com)',
          },
        ],
      };
      const content = projectBlockToMarkdown(withLinks);
      const buffer = await renderToBuffer(<SkillSheetDocument title="テスト" content={content} />);
      const raw = buffer.toString('latin1');

      expect(raw).not.toContain('javascript:');
      expect(raw).not.toContain('file:///etc/passwd');
      // 安全なリンクは従来どおり注釈になること（許可リストが全部落としていない証拠）。
      expect(raw).toContain('https://example.com');
      // リンクの文言自体は本文として残る。
      const text = normalizeExtractedText(await extractPdfText(buffer));
      expect(text).toContain('報告書');
      expect(text).toContain('社内');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'D社相当の長文案件を描画できる',
    async () => {
      const content = [
        '### D社 — 配達業務アプリの開発',
        '',
        '| 項目 | 内容 |',
        '| :--- | :--- |',
        '| 期間 | 2024.04〜2024.12 |',
        '| 役割 | SE |',
        '| 技術スタック | TypeScript, Python, Next.js, Chakra UI, GraphQL, FastAPI, PostgreSQL, AWS |',
        '',
        '**習得スキル・実績**',
        '',
        'GRAPHQL, オニオンアーキテクチャ、クリーンアーキテクチャ、Next.js パフォーマンス最適化、',
        'Python での Excel 出力',
        '本案件では、実装をメインで担当しておりました。',
        'バックエンド',
        'バックエンドは、Python での Excel 出力を担当致しました。',
        'Pythonのような型定義が甘めの言語では、デバッグの難易度が少々上がるため、デバッグの開発体験は重要だと感じて',
        'いました。',
        'Vscodeのlaunch.json等の設定やDocker上でのDebugポートの設定を行いました。',
        'フロントエンド',
        '2024年9月時点で最新のNext.js app routerの実装を担当致しました。',
      ].join('\n');

      const buffer = await renderToBuffer(<SkillSheetDocument title="エンジニアスキルシート" content={content} />);
      expect(buffer.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER);
      expect(buffer.subarray(-1024).toString('latin1')).toContain('%%EOF');
    },
    RENDER_TIMEOUT_MS,
  );
});
