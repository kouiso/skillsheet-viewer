import { Document, Link, Page, Text as PdfText, StyleSheet, View } from '@react-pdf/renderer';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { DESIGN_TOKENS_LIGHT } from '@/lib/design-tokens';
import { MARKDOWN_REMARK_PLUGINS } from '@/lib/markdown-config';
import PDF_FONT_FAMILY from './constants';

// @react-pdf/textkit の getNodes() は、非空白シラブルの直後が厳密に半角スペース ' ' で
// ない限り hyphenated:true を立て、penalty ノード（既定 hyphenPenalty=600）を追加する。
// splitForHyphenation()（pdf/fonts.ts）が挟む ZWNBSP（U+FEFF）は ' ' と一致しないため、
// CJK文字の直後には常にこの penalty ノードが付いてしまう。K&P改行選択がこのブレーク
// ポイントを選んだ場合、breakLines() が実際にハイフン記号(U+002D)を挿入する（隣接する
// ZWNBSP境界＝penalty=0のglueブレークの方がdemeritは低く通常は選ばれないが、狭い列幅
// では選ばれうる。Issue #171 Codexレビュー指摘）。hyphenationPenalty は Text ノード
// 単位のプロパティ（node.props を直接読む実装で、公開型には未定義）で、十分大きい値に
// すればこのブレークポイントを事実上選択不可能にし、ZWNBSP境界を常に優先させられる。
const HYPHENATION_PENALTY_SUPPRESSED = 100000;
type LocalTextProps = ComponentProps<typeof PdfText> & { hyphenationPenalty?: number };
const PdfTextEx = PdfText as unknown as ComponentType<LocalTextProps>;
function Text({ hyphenationPenalty = HYPHENATION_PENALTY_SUPPRESSED, ...props }: LocalTextProps) {
  return <PdfTextEx hyphenationPenalty={hyphenationPenalty} {...props} />;
}

// Console テーマ（globals.css の light トークン）に合わせたデザイントークン。
// 値は design-tokens.ts を単一の真実として import し、globals.css との乖離を
// design-tokens.test.ts で機械検証する（PDF は CSS 変数を直接解決できないため）。
const COLOR = {
  primary: DESIGN_TOKENS_LIGHT.primary,
  primaryDark: DESIGN_TOKENS_LIGHT.primaryDark,
  text: DESIGN_TOKENS_LIGHT.foreground,
  textSecondary: DESIGN_TOKENS_LIGHT.mutedForeground,
  divider: DESIGN_TOKENS_LIGHT.border,
  headerBg: DESIGN_TOKENS_LIGHT.muted,
  codeBg: DESIGN_TOKENS_LIGHT.muted,
} as const;

// ロジック中で使う数値（マジックナンバー回避のため定数化）。テストから閾値を直接
// 参照できるよう export する（CodeRabbit レビュー指摘: 回帰テストが閾値をハードコード
// すると、実装側で閾値を変更してもテストが追従せず静かに意味を失う）。
export const NUM = {
  HEADING_H1: 1,
  HEADING_H2: 2,
  HEADING_H3: 3,
  WEIGHT_BOLD: 700,
  WEIGHT_NORMAL: 400,
  TWO_COLUMN: 2,
  COL_LABEL_FLEX: 3,
  COL_VALUE_FLEX: 7,
  MIN_PRESENCE_PROJECT: 48,
  // A4 1ページに収まる目安の行内文字数。これを超える行は複数ページにまたがってよい
  // (wrap=true) とし、収まる行だけを1ページ内で分割不可 (wrap=false) にする。
  ROW_UNBREAKABLE_CHAR_LIMIT: 600,
  // 見出し+直後の表をまとめて分割不可 (wrap=false) にしてよい表の最大行数。
  // 案件カードの表（期間/役割/規模/チーム/技術スタック/担当工程 等、最大6行程度）は
  // 必ずこれを下回る。行数が多い表（例: スキル一覧の1カテゴリに項目が多い場合）は
  // 1行あたりの文字数が短くても表全体では1ページに収まらないことがあるため、
  // ROW_UNBREAKABLE_CHAR_LIMIT による文字数判定だけでなく行数でも足切りする。
  //
  // 実測（@react-pdf/renderer 4.5.1、実データ相当32件のカードで検証）: 案件カードが
  // 多いドキュメントでは、ページ途中から始まるカードの内容が丸ごと欠落する（クリップ
  // ではなく消失）バグが存在する。これは本 PR の見出し+表の結合描画（wrap=false）が
  // 原因ではなく、結合を外しても再現する、より根深い既存バグと判明した（詳細は #172）。
  // したがって CARD_MAX_ROWS だけでは #172 は解決しない。ここでの引き下げは、少なくとも
  // 「1つの表が単独で大きすぎて footprint を圧迫する」経路の安全マージンを稼ぐための
  // 対症療法であり、根本原因の追跡は #172 に委ねる。
  CARD_MAX_ROWS: 10,
  // 見出し+表+後続段落（会社概要文/業務内容/習得スキル・実績）をまとめて1ページに収める
  // 見込みかどうかの目安の合計文字数。ROW_UNBREAKABLE_CHAR_LIMIT と同じ「文字数概算」の
  // 考え方を、表だけでなくカード全体（見出し直後に続く段落群まで）に広げたもの。
  // 実データ32件のカードで実測して調整している（Issue #194: 見出し+表だけを結合対象に
  // していたため、後続の会社概要文・業務内容・習得スキル・実績が独立した分割単位のまま
  // 残り、ページ境界でカードが分断されていた）。
  CARD_TOTAL_CHAR_LIMIT: 1400,
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9.5,
    lineHeight: 1.6,
    color: COLOR.text,
  },
  titleWrap: { marginBottom: 14 },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: COLOR.primary,
    borderBottomWidth: 2,
    borderBottomColor: COLOR.primary,
    paddingBottom: 6,
  },
  headingWrap: { marginTop: 12, marginBottom: 6 },
  h1: {
    fontSize: 16,
    fontWeight: 700,
    color: COLOR.primary,
    borderBottomWidth: 2,
    borderBottomColor: COLOR.primary,
    paddingBottom: 4,
  },
  h2: {
    fontSize: 13,
    fontWeight: 700,
    color: COLOR.text,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.divider,
    paddingBottom: 3,
  },
  h3: { fontSize: 12, fontWeight: 700, color: COLOR.primaryDark },
  h4: { fontSize: 10.5, fontWeight: 700, color: COLOR.text },
  hProject: { color: COLOR.primary },
  paragraphWrap: { marginBottom: 5 },
  paragraph: { textAlign: 'left' },
  bold: { fontWeight: 700 },
  italic: { fontStyle: 'italic' },
  strike: { textDecoration: 'line-through' },
  // Courier は CJK 字形を持たず日本語が tofu になるため、登録済みの Noto Sans JP を使う。
  // 等幅よりも日本語が確実に描画されることを優先する。
  inlineCode: { fontFamily: PDF_FONT_FAMILY, fontSize: 8.5, backgroundColor: COLOR.codeBg },
  link: { color: COLOR.primary, textDecoration: 'underline' },
  list: { marginBottom: 6, marginTop: 2 },
  listItem: { flexDirection: 'row', marginBottom: 2 },
  listBullet: { width: 14, color: COLOR.primary },
  listContent: { flex: 1 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: COLOR.primary,
    paddingLeft: 8,
    marginVertical: 6,
    color: COLOR.textSecondary,
  },
  hr: { borderBottomWidth: 1, borderBottomColor: COLOR.divider, marginVertical: 10 },
  codeBlock: {
    backgroundColor: COLOR.codeBg,
    padding: 6,
    marginVertical: 6,
    // Courier は CJK 字形を持たないため、日本語を含むコードでも描画できる Noto Sans JP を使う。
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 8.5,
  },
  table: {
    marginVertical: 6,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: COLOR.divider,
    borderLeftWidth: 1,
    borderLeftColor: COLOR.divider,
  },
  tableRow: { flexDirection: 'row', width: '100%' },
  tableCell: {
    padding: 4,
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: COLOR.divider,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.divider,
  },
  tableHeaderCell: { backgroundColor: COLOR.headerBg },
  cellText: { fontSize: 9 },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 44,
    right: 44,
    // 明示的な height を与えないと fixed 絶対配置の box 高さがページ毎に発散する（react-pdf v4）
    height: 12,
    lineHeight: 1,
    textAlign: 'center',
    fontSize: 8,
    color: COLOR.textSecondary,
  },
});

type PdfStyle = (typeof styles)[keyof typeof styles];

// テスト（skill-sheet-document.render.test.tsx の見出し+表 wrap 制御の構造検証）
// から直接 mdast ノードを組み立てられるようにエクスポートする。
export interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  children?: MdNode[];
  align?: (string | null)[];
  url?: string;
}

function nodeText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  if (node.children) return node.children.map(nodeText).join('');
  return '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// --- インライン描画 -------------------------------------------------------

// link は Link コンポーネントで個別に描画するためマップには含めない
const INLINE_STYLE = new Map<string, PdfStyle>([
  ['strong', styles.bold],
  ['emphasis', styles.italic],
  ['delete', styles.strike],
]);

// 子を持たない単純なインラインノード（テキスト/改行/インラインHTML）
const INLINE_LEAF = new Map<string, (node: MdNode) => ReactNode>([
  ['text', (node) => node.value ?? null],
  ['break', () => '\n'],
  ['html', () => null],
]);

// インライン描画の文脈オプション。inTableCell=true のときはリンクの
// クリック注釈（<Link>）を抑制する（下記 link 分岐を参照）。
interface InlineContext {
  inTableCell?: boolean;
}

function renderInline(nodes: MdNode[] | undefined, ctx?: InlineContext): ReactNode {
  if (!nodes) return null;
  return nodes.map((node, i) => renderInlineNode(node, i, ctx));
}

function renderInlineNode(node: MdNode, key: number, ctx?: InlineContext): ReactNode {
  const leaf = INLINE_LEAF.get(node.type);
  if (leaf) return leaf(node);
  if (node.type === 'inlineCode') {
    return (
      <Text key={key} style={styles.inlineCode}>
        {node.value}
      </Text>
    );
  }
  if (node.type === 'link') {
    // 表セル内はセル幅で内容を clip するが、<Link> が生成するクリック注釈は
    // clip の対象外で、隣のセル上に不可視のクリック領域として漏れる。セル内では
    // 注釈を出さない styled Text として描画し、注釈自体を発生させない
    // （見た目は従来どおり色付き下線を維持）。段落等の通常文脈は <Link> のまま。
    if (ctx?.inTableCell) {
      return (
        <Text key={key} style={styles.link}>
          {renderInline(node.children, ctx)}
        </Text>
      );
    }
    return (
      <Link key={key} src={node.url ?? ''} style={styles.link}>
        {renderInline(node.children, ctx)}
      </Link>
    );
  }
  const style = INLINE_STYLE.get(node.type);
  if (style) {
    return (
      <Text key={key} style={style}>
        {renderInline(node.children, ctx)}
      </Text>
    );
  }
  return node.children ? renderInline(node.children, ctx) : (node.value ?? null);
}

// --- ブロック描画 ---------------------------------------------------------

function headingStyle(depth: number): PdfStyle {
  if (depth <= NUM.HEADING_H1) return styles.h1;
  if (depth === NUM.HEADING_H2) return styles.h2;
  if (depth === NUM.HEADING_H3) return styles.h3;
  return styles.h4;
}

function isProjectHeading(node: MdNode): boolean {
  return nodeText(node).trimStart().startsWith('■');
}

// 見出しの Text 部分のみを組み立てる。見出し単体描画 (renderHeading) と
// 見出し+表の結合描画 (renderHeadingWithTable) の両方から共有する。
function renderHeadingText(node: MdNode): ReactNode {
  const depth = node.depth ?? NUM.HEADING_H1;
  const base = headingStyle(depth);
  const isProject = isProjectHeading(node);
  return <Text style={isProject ? [base, styles.hProject] : base}>{renderInline(node.children)}</Text>;
}

function renderHeading(node: MdNode, key: number): ReactNode {
  const isProject = isProjectHeading(node);
  return (
    <View key={key} style={styles.headingWrap} minPresenceAhead={isProject ? NUM.MIN_PRESENCE_PROJECT : 0}>
      {renderHeadingText(node)}
    </View>
  );
}

function renderParagraph(node: MdNode, key: number): ReactNode {
  return (
    <View key={key} style={styles.paragraphWrap}>
      <Text style={styles.paragraph}>{renderInline(node.children)}</Text>
    </View>
  );
}

function renderList(node: MdNode, key: number): ReactNode {
  const ordered = Boolean(node.ordered);
  return (
    <View key={key} style={styles.list}>
      {(node.children ?? []).map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: mdast リストアイテムは安定 id を持たない
        <View key={i} style={styles.listItem}>
          <Text style={styles.listBullet}>{ordered ? `${i + 1}.` : '•'}</Text>
          <View style={styles.listContent}>{renderBlocks(item.children)}</View>
        </View>
      ))}
    </View>
  );
}

// パーセント幅はページ境界の再レイアウトで破綻するため、flex 比率で列幅を表現する。
function cellFlexGrow(columnIndex: number, columnCount: number): number {
  if (columnCount === NUM.TWO_COLUMN) return columnIndex === 0 ? NUM.COL_LABEL_FLEX : NUM.COL_VALUE_FLEX;
  return 1;
}

function renderTableCell(
  cell: MdNode,
  columnIndex: number,
  columnCount: number,
  align: (string | null)[],
  isHeader: boolean,
): ReactNode {
  const a = align.at(columnIndex);
  const textAlign = a === 'center' ? 'center' : a === 'right' ? 'right' : 'left';
  // 空セル（担当工程の未経験欄など）は空文字だとレイアウト計算が破綻するため、
  // 高さを保つノーブレークスペースを入れる。
  // セル内リンクは注釈が隣セルへ漏れるため inTableCell フラグで <Link> を抑制する。
  const inline = renderInline(cell.children, { inTableCell: true });
  const isEmpty = inline == null || (Array.isArray(inline) && inline.length === 0);
  return (
    <View
      key={columnIndex}
      style={[
        styles.tableCell,
        isHeader ? styles.tableHeaderCell : {},
        { flexGrow: cellFlexGrow(columnIndex, columnCount) },
      ]}
    >
      <Text style={[styles.cellText, { textAlign, fontWeight: isHeader ? NUM.WEIGHT_BOLD : NUM.WEIGHT_NORMAL }]}>
        {isEmpty ? ' ' : inline}
      </Text>
    </View>
  );
}

// 行内の全セルのテキスト長を合計し、1ページに収まりそうかの目安にする。
function rowTextLength(row: MdNode): number {
  return (row.children ?? []).reduce((sum, cell) => sum + nodeText(cell).length, 0);
}

function renderTable(node: MdNode, key: number): ReactNode {
  const rows = node.children ?? [];
  const columnCount = rows[0]?.children?.length ?? 0;
  if (columnCount === 0) return null;
  const align = node.align ?? [];
  return (
    <View key={key} style={styles.table} wrap={true}>
      {rows.map((row, ri) => {
        // 1ページに収まる見込みの行だけ1行の途中でのページ分割を禁止する(wrap=false)。
        // 1ページに収まらない見込みの行(文字数が閾値超)はwrap=trueにして複数ページに
        // またがることを許容する。これがfalse固定だと、そうした行はどのページにも
        // 収まらず内容がクリップされてしまう(このPRが直すべきPDF欠落バグの再発)。
        const oversized = rowTextLength(row) > NUM.ROW_UNBREAKABLE_CHAR_LIMIT;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: mdast テーブル行は安定idを持たない
          <View key={ri} style={styles.tableRow} wrap={oversized}>
            {(row.children ?? []).map((cell, ci) => renderTableCell(cell, ci, columnCount, align, ri === 0))}
          </View>
        );
      })}
    </View>
  );
}

// 見出し+表+表直後の段落群を、外側の View ごと wrap={false}（分割不可）にしてよいかの
// 目安判定。renderTable が行単位で使う rowTextLength / ROW_UNBREAKABLE_CHAR_LIMIT と
// 同じ「文字数概算」の考え方を、カード全体（表＋後続段落）に広げたもの。
//
// 行ごとの上限チェック（rows.every(...)）は外せない: 外側 View が wrap={false} だと、
// renderTable が個々の行に付ける wrap={true}（1ページに収まらない行を複数ページへ
// 逃がす仕組み、#147/#172 で入れた）が外側の非分割指定に埋もれて効かなくなる。
// 合計文字数がカード全体の上限内でも、そのうち1行だけが極端に長ければ、その行は
// どのページにも収まらず内容が消失する（#147/#172 の再発）。行数（CARD_MAX_ROWS）と
// 行ごとの文字数（ROW_UNBREAKABLE_CHAR_LIMIT）は据え置いたうえで、カード全体の合計
// 文字数（表＋後続段落）にも CARD_TOTAL_CHAR_LIMIT を課す（Issue #194）。
// 表・リストは項目（行）ごとに固定の行間・パディングを持つため、合計文字数だけでは
// 項目数が多い場合の実際の高さを過小評価する。primary の表が受けている行単位のチェック
// （CARD_MAX_ROWS / ROW_UNBREAKABLE_CHAR_LIMIT）は、trailing 中に含まれる表・リスト
// （duties/acquired 等の自由記述が GFM 表や箇条書きになったもの）には及んでおらず、
// 短いセル/項目が多数並ぶケースで合計文字数だけは閾値内に収まり誤って wrap={false}
// になりうる（chatgpt-codex-connector レビュー指摘）。tableNode と trailing 中の
// 表・リストをまとめて「行相当」の単位に展開し、primary の表と同じ基準を適用する。
function rowLikeLengths(node: MdNode): number[] {
  if (node.type === 'table') return (node.children ?? []).map(rowTextLength);
  if (node.type === 'list') return (node.children ?? []).flatMap(listItemRowLikeLengths);
  // blockquote 等のコンテナに表・リストが入れ子になっているケースを取りこぼさないよう
  // 再帰的に展開する（CodeRabbit レビュー指摘）。この結果は下記 proseCharCount の
  // 除外対象に含めていないため、blockquote 配下の表・リスト文字数は構造チェック側
  // （行数・行文字数）とプロース側の両方で数えられるが、二重計上は総文字数を実際より
  // 大きく見積もる方向にしか働かず、安全側（wrap={true} になりやすい）に倒れるだけで
  // クリップのリスクは生まない。
  if (node.type === 'blockquote') return (node.children ?? []).flatMap(rowLikeLengths);
  return [];
}

// リスト項目1つを「行相当」の単位に展開する。トップレベルの項目数だけを数えると、
// 1項目の中にネストした箇条書き（子の list）が多数ぶら下がっているケース
// （見た目は1項目でも renderList は再帰的に全ネスト項目を描画するため、実際は
// 多くの行を消費する）で行数チェックをすり抜け、合計文字数も閾値内に収まって
// 誤って wrap={false} になりうる（chatgpt-codex-connector レビュー指摘）。
// 項目自身のテキスト（ネストした list を除く）と、ネストした list の各項目とを、
// それぞれ独立した「行」として再帰的に数える。
function listItemRowLikeLengths(item: MdNode): number[] {
  const children = item.children ?? [];
  const nestedLists = children.filter((child) => child.type === 'list');
  const ownText = children
    .filter((child) => child.type !== 'list')
    .map(nodeText)
    .join('');
  return [ownText.length, ...nestedLists.flatMap((list) => (list.children ?? []).flatMap(listItemRowLikeLengths))];
}

function isCardLikelyToFitOnePage(tableNode: MdNode, trailingBlocks: MdNode[]): boolean {
  const rowLike = [tableNode, ...trailingBlocks].flatMap(rowLikeLengths);
  if (rowLike.length > NUM.CARD_MAX_ROWS) return false;
  if (!rowLike.every((len) => len <= NUM.ROW_UNBREAKABLE_CHAR_LIMIT)) return false;
  const structuralCharCount = rowLike.reduce((sum, len) => sum + len, 0);
  const proseCharCount = trailingBlocks
    .filter((block) => block.type !== 'table' && block.type !== 'list')
    .reduce((sum, block) => sum + nodeText(block).length, 0);
  return structuralCharCount + proseCharCount <= NUM.CARD_TOTAL_CHAR_LIMIT;
}

// 見出し直後に表が続くケース（案件カードの見出し+項目表、スキルカテゴリ見出し+
// スキル表）を1つの View にまとめて描画する。案件カードは表の直後に会社概要文・
// 業務内容・習得スキル・実績の段落が続くことがあり（projectBlockToMarkdown 参照）、
// これらも見出し・表と同じ分割制御単位に含める（Issue #194）。
// - 全体が1ページに収まる見込みなら wrap={false} で丸ごと分割不可にし、見出しだけが
//   前ページに取り残されたり、カードの途中でページが割れたりするのを防ぐ。
// - 収まらない見込みなら wrap={true} にして renderTable 内の行単位wrap制御・各段落の
//   通常描画に委ね、内容が強制的に1ページへ押し込まれてクリップされるのを防ぐ
//   （renderTable が採用している閾値方式をそのまま踏襲）。
// - どちらの場合も minPresenceAhead を設定し、見出し単独がページ末尾に残るのを防ぐ
//   （収まらず wrap=true になるケースのフォールバック保護でもある）。
function renderHeadingWithTable(
  headingNode: MdNode,
  tableNode: MdNode,
  trailingBlocks: MdNode[],
  key: number,
): ReactNode {
  const fitsOnePage = isCardLikelyToFitOnePage(tableNode, trailingBlocks);
  // children を1つの配列としてまとめて渡す（JSX の子要素を個別の式スロットで並べると、
  // trailingBlocks が空でも props.children にその分の要素が残ってしまい、
  // 「見出し+表の2要素だけの場合」の構造検証テストと形が食い違うため）。
  const children: ReactNode[] = [
    <View key="heading" style={styles.headingWrap}>
      {renderHeadingText(headingNode)}
    </View>,
    renderTable(tableNode, key),
    // trailingBlocks は paragraph に限らない（duties/acquired 等の自由記述が
    // list になりうるため）。型ごとの描画は renderBlocks と同じ BLOCK_RENDERERS を使う。
    ...trailingBlocks.map((p, i) => {
      const renderer = BLOCK_RENDERERS.get(p.type);
      return renderer ? renderer(p, key * 1000 + i + 1) : null;
    }),
  ];
  return (
    <View key={key} wrap={!fitsOnePage} minPresenceAhead={NUM.MIN_PRESENCE_PROJECT}>
      {children}
    </View>
  );
}

function renderBlockquote(node: MdNode, key: number): ReactNode {
  return (
    <View key={key} style={styles.blockquote}>
      {renderBlocks(node.children)}
    </View>
  );
}

function renderHr(_node: MdNode, key: number): ReactNode {
  return <View key={key} style={styles.hr} />;
}

function renderCodeBlock(node: MdNode, key: number): ReactNode {
  return (
    <View key={key} style={styles.codeBlock}>
      <Text>{node.value}</Text>
    </View>
  );
}

function renderHtmlBlock(node: MdNode, key: number): ReactNode {
  const raw = node.value ?? '';
  const text = stripHtml(raw);
  if (!text) return null;
  // 見出しタグを含む HTML（例: <summary><h2>…</h2></summary>）のみ見出しとして描画し、
  // それ以外（注記や改行等）は通常の段落として描画してレイアウト崩れを防ぐ。
  const isHeading = /<h[1-6][\s>]/i.test(raw);
  return (
    <View key={key} style={isHeading ? styles.headingWrap : styles.paragraphWrap}>
      <Text style={isHeading ? styles.h2 : styles.paragraph}>{text}</Text>
    </View>
  );
}

type BlockRenderer = (node: MdNode, key: number) => ReactNode;

const BLOCK_RENDERERS = new Map<string, BlockRenderer>([
  ['heading', renderHeading],
  ['paragraph', renderParagraph],
  ['list', renderList],
  ['table', renderTable],
  ['blockquote', renderBlockquote],
  ['thematicBreak', renderHr],
  ['code', renderCodeBlock],
  ['html', renderHtmlBlock],
]);

// テストから直接呼び出し、見出し+表の結合（renderHeadingWithTable への振り分けと
// wrap/minPresenceAhead 制御）が意図どおり構造化されているかを検証できるようにする。
export function renderBlocks(nodes: MdNode[] | undefined): ReactNode {
  if (!nodes) return null;
  const out: ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const next = nodes[i + 1];
    // 見出しの直後に表が続く場合は1つの分割制御単位にまとめる（案件カード/
    // スキルカテゴリ表のページ境界分断対策）。表は結合済みとしてスキップする。
    // 表の直後に続く内容（案件カードの会社概要文・業務内容・習得スキル・実績）も
    // 同じ単位に含める（Issue #194）。次の**見出し**に当たった時点で打ち切り、
    // それ以外の型（paragraph・list・table・blockquote 等）は全て取り込む。
    // duties/acquired 等はユーザーの自由記述で、箇条書き（list）や GFM 表になることが
    // あるため、paragraph だけに限定するとその内容が別の分割単位に外れ、
    // 見出し+表だけが1ページ目・内容が次ページに漏れる（#194 の再発。レビュー指摘）。
    // 表も次の見出しが来るまでは打ち切らない: 新しいカードの表は必ずそのカード自身の
    // 見出しの直後に現れる（heading+table のペアとしてこの外側ループが検出する）ため、
    // trailing 走査中に「見出しを伴わない」表に出会った場合はそれ自体が別カードの
    // 開始ではあり得ず、現在のカードの自由記述内の表と判断してよい
    // （chatgpt-codex-connector レビュー指摘: table だけ除外していたのは非対称だった）。
    // ブロック同士は空行だけで連結される（blocksToMarkdown）ため、この案件カード
    // の直後に見出しを持たない markdown ブロックが続く稀なケースでは、その内容も
    // このカードの一部として扱われる（表示上は連続するため実害は小さいが、
    // 意図しない分割制御を受ける可能性がある既知の制約）。
    if (node.type === 'heading' && next?.type === 'table') {
      let j = i + 2;
      const trailing: MdNode[] = [];
      while (j < nodes.length && nodes[j].type !== 'heading') {
        trailing.push(nodes[j]);
        j += 1;
      }
      out.push(renderHeadingWithTable(node, next, trailing, i));
      i = j - 1;
      continue;
    }
    const renderer = BLOCK_RENDERERS.get(node.type);
    out.push(renderer ? renderer(node, i) : null);
  }
  return out;
}

export interface SkillSheetDocumentProps {
  title: string;
  content: string;
}

/**
 * Markdown のスキルシートを、ビューア準拠デザインの本物の PDF として描画する（純粋描画）。
 * フォント登録は呼び出し側で行う前提（ブラウザ: pdf/fonts.ts / Node: 検証スクリプト）。
 */
export const SkillSheetDocument = ({ title, content }: SkillSheetDocumentProps) => {
  // remark-breaks を加えてビューアと同じく単一改行（ソフトブレーク）を改行として扱う。
  // remark-breaks は tree トランスフォーマのため parse だけでは適用されない。
  // runSync まで通してプラグインの変換フェーズを実行する。
  // プラグイン構成は MARKDOWN_REMARK_PLUGINS（ビューア側と共通）を使う。ここだけ独自に
  // 組むと、プラグインを足したときに画面と PDF の解釈がズレる（remarkCjkFriendly の
  // 取りこぼしで実際に発生した、#138 のレビュー指摘）。
  const processor = unified().use(remarkParse).use(MARKDOWN_REMARK_PLUGINS);
  const tree = processor.runSync(processor.parse(content)) as unknown as MdNode;

  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{title}</Text>
        </View>
        {renderBlocks(tree.children)}
        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
};

export default SkillSheetDocument;
