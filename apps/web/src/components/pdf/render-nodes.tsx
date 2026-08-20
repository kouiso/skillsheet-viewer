/**
 * mdast のノードを @react-pdf のプリミティブへ落とす描画関数群。
 * 値の定義（配色・寸法・スタイル）は pdf-theme.tsx、
 * 文書の組み立ては skill-sheet-document.tsx が持つ。
 */
import { Link, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { isSafeLinkHref } from '@/lib/markdown-config';

import { toRenderableText } from './glyph-coverage';
import {
  CONTENT_WIDTH,
  estimateBlockHeight,
  estimateBlocksHeight,
  estimateTableRowHeight,
  fitsWithinPage,
  SPACING,
} from './layout-metrics';
import { type MdNode, nodeText } from './mdast';
import { NUM, type PdfStyle, styles, Text } from './pdf-theme';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// 登録フォントが字形を持たない文字は、無関係なグリフが送り幅 0 で重なって描かれ、
// 直後の文字まで潰す（Issue #263 E）。PDF に載る文字列は必ずここを通す。
export function safe(text: string): string {
  return toRenderableText(text);
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
  ['text', (node) => (node.value == null ? null : safe(node.value))],
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
        {safe(node.value ?? '')}
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
    // 画面側は rehype-sanitize が javascript:/file: 等の href を落とすが、<Link src> は
    // そのまま PDF の URI アクションになる。安全なスキーム以外は注釈を出さず、
    // 見た目だけ従来どおりの styled Text にする（本文は消さない）。
    const href = node.url ?? '';
    if (!isSafeLinkHref(href)) {
      return (
        <Text key={key} style={styles.link}>
          {renderInline(node.children, ctx)}
        </Text>
      );
    }
    return (
      <Link key={key} src={href} style={styles.link}>
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
  return node.children ? renderInline(node.children, ctx) : node.value == null ? null : safe(node.value);
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

function renderHeading(node: MdNode, key: number, _width: number): ReactNode {
  // 見出しの種類にかかわらず minPresenceAhead を設定する。旧実装は案件見出し（■）
  // だけを対象にしていたため、通常の `##` 見出しが本文と切り離されてページ末尾に
  // 取り残されていた（Issue #263 D）。
  return (
    <View key={key} style={styles.headingWrap} minPresenceAhead={NUM.MIN_PRESENCE_HEADING}>
      {renderHeadingText(node)}
    </View>
  );
}

function renderParagraph(node: MdNode, key: number, _width: number): ReactNode {
  return (
    <View key={key} style={styles.paragraphWrap}>
      <Text style={styles.paragraph}>{renderInline(node.children)}</Text>
    </View>
  );
}

function renderList(node: MdNode, key: number, width: number): ReactNode {
  const ordered = Boolean(node.ordered);
  // 箇条書きの中身は行頭記号の幅だけ狭くなる。高さ見積りも同じ幅で行わないと、
  // 入れ子の表・カードが「1ページに収まる」と過小評価されてしまう。
  const contentWidth = Math.max(0, width - SPACING.LIST_BULLET_WIDTH);
  return (
    <View key={key} style={styles.list}>
      {(node.children ?? []).map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: mdast リストアイテムは安定 id を持たない
        <View key={i} style={styles.listItem}>
          <Text style={styles.listBullet}>{ordered ? `${i + 1}.` : '•'}</Text>
          <View style={styles.listContent}>{renderBlocks(item.children, contentWidth)}</View>
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
        {isEmpty ? ' ' : inline}
      </Text>
    </View>
  );
}

function renderTable(node: MdNode, key: number, width: number): ReactNode {
  const rows = node.children ?? [];
  const columnCount = rows[0]?.children?.length ?? 0;
  if (columnCount === 0) return null;
  const align = node.align ?? [];
  return (
    <View key={key} style={styles.table} wrap={true}>
      {rows.map((row, ri) => {
        // 1 ページに確実に収まると見積もれる行だけ、行の途中でのページ分割を禁止する
        // （wrap=false）。収まると分かっている行は、現在のページに入りきらなくても
        // react-pdf が次ページ先頭へ丸ごと送るだけなので内容は失われない。逆に
        // 1 ページに収まらない行を wrap=false にすると、その行はどのページにも入れず
        // 内容が消える（#147/#172）。見積りは文字数ではなく pt 単位の高さで行う。
        const unbreakable = fitsWithinPage(estimateTableRowHeight(node, row, width));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: mdast テーブル行は安定idを持たない
          <View key={ri} style={styles.tableRow} wrap={!unbreakable}>
            {(row.children ?? []).map((cell, ci) => renderTableCell(cell, ci, columnCount, align, ri === 0))}
          </View>
        );
      })}
    </View>
  );
}

/**
 * 見出し+表+後続ブロック（案件カード）を丸ごと分割不可（wrap={false}）にしてよいか。
 *
 * 旧実装は「行数 <= 10 かつ合計文字数 <= 1400」という文字数ベースの近似で判定していたが、
 * 文字数は高さの代理変数として成立しない。実測では「8 文字の段落 150 個 = 1200 文字」が
 * 閾値を通過し、実高さ 3000pt 超のカードが分割不可のまま 1 ページへ押し込まれて本文が
 * 丸ごと PDF から消えた（Issue #262）。ここでは layout-metrics の pt 単位の上振れ見積り
 * を使い、安全率込みで 1 ページに収まると言える場合だけ true を返す。
 *
 * 収まると分かっているノードを wrap={false} にしても、@react-pdf/layout は
 * 「現在ページに入らなければ次ページ先頭へ丸ごと送る」だけで内容を落とさない。
 * 内容が消えるのは「1 ページより大きいノードを wrap={false} にしたとき」だけなので、
 * この判定が真に上振れ見積りである限り欠落は構造的に起こらない。
 */
export function isCardLikelyToFitOnePage(
  headingNode: MdNode,
  tableNode: MdNode,
  trailingBlocks: MdNode[],
  width: number = CONTENT_WIDTH,
): boolean {
  const height =
    estimateBlockHeight(headingNode, width) +
    estimateBlockHeight(tableNode, width) +
    estimateBlocksHeight(trailingBlocks, width);
  return fitsWithinPage(height);
}

// 見出し直後に表が続くケース（案件カードの見出し+項目表、スキルカテゴリ見出し+
// スキル表）を1つの View にまとめて描画する。案件カードは表の直後に会社概要文・
// 業務内容・習得スキル・実績の段落が続くことがあり（projectBlockToMarkdown 参照）、
// これらも見出し・表と同じ分割制御単位に含める（Issue #194）。
// - 1ページに収まると見積もれるときだけ wrap={false} で丸ごと分割不可にし、見出しだけが
//   前ページに取り残されたり、カードの途中でページが割れたりするのを防ぐ。
// - 収まらないときは wrap={true} にして renderTable 内の行単位wrap制御・各段落の
//   通常描画に委ね、内容が強制的に1ページへ押し込まれて消えるのを防ぐ。
// - どちらの場合も見出し側に minPresenceAhead を設定し、見出し単独がページ末尾に
//   残るのを防ぐ（wrap=true になるケースのフォールバック保護でもある）。
function renderHeadingWithTable(
  headingNode: MdNode,
  tableNode: MdNode,
  trailingBlocks: MdNode[],
  key: number,
  width: number,
): ReactNode {
  const fitsOnePage = isCardLikelyToFitOnePage(headingNode, tableNode, trailingBlocks, width);
  // children を1つの配列としてまとめて渡す（JSX の子要素を個別の式スロットで並べると、
  // trailingBlocks が空でも props.children にその分の要素が残ってしまい、
  // 「見出し+表の2要素だけの場合」の構造検証テストと形が食い違うため）。
  const children: ReactNode[] = [
    <View key="heading" style={styles.headingWrap} minPresenceAhead={NUM.MIN_PRESENCE_HEADING}>
      {renderHeadingText(headingNode)}
    </View>,
    renderTable(tableNode, key, width),
    // trailingBlocks は paragraph に限らない（duties/acquired 等の自由記述が
    // list になりうるため）。型ごとの描画は renderBlocks と同じ BLOCK_RENDERERS を使う。
    ...trailingBlocks.map((p, i) => {
      const renderer = BLOCK_RENDERERS.get(p.type);
      return renderer ? renderer(p, key * 1000 + i + 1, width) : null;
    }),
  ];
  return (
    <View key={key} wrap={!fitsOnePage} minPresenceAhead={NUM.MIN_PRESENCE_HEADING}>
      {children}
    </View>
  );
}

function renderBlockquote(node: MdNode, key: number, width: number): ReactNode {
  const contentWidth = Math.max(0, width - SPACING.BLOCKQUOTE_BORDER_LEFT - SPACING.BLOCKQUOTE_PADDING_LEFT);
  return (
    <View key={key} style={styles.blockquote}>
      {renderBlocks(node.children, contentWidth)}
    </View>
  );
}

function renderHr(_node: MdNode, key: number, _width: number): ReactNode {
  return <View key={key} style={styles.hr} />;
}

function renderCodeBlock(node: MdNode, key: number, _width: number): ReactNode {
  return (
    <View key={key} style={styles.codeBlock}>
      <Text>{safe(node.value ?? '')}</Text>
    </View>
  );
}

function renderHtmlBlock(node: MdNode, key: number, _width: number): ReactNode {
  const raw = node.value ?? '';
  const text = stripHtml(raw);
  if (!text) return null;
  // 見出しタグを含む HTML（例: <summary><h2>…</h2></summary>）のみ見出しとして描画し、
  // それ以外（注記や改行等）は通常の段落として描画してレイアウト崩れを防ぐ。
  const isHeading = /<h[1-6][\s>]/i.test(raw);
  return (
    <View
      key={key}
      style={isHeading ? styles.headingWrap : styles.paragraphWrap}
      minPresenceAhead={isHeading ? NUM.MIN_PRESENCE_HEADING : 0}
    >
      <Text style={isHeading ? styles.h2 : styles.paragraph}>{safe(text)}</Text>
    </View>
  );
}

// width は「そのブロックが使える横幅（pt）」。分割不可にしてよいかの高さ見積りに使う。
type BlockRenderer = (node: MdNode, key: number, width: number) => ReactNode;

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
export function renderBlocks(nodes: MdNode[] | undefined, width: number = CONTENT_WIDTH): ReactNode {
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
      out.push(renderHeadingWithTable(node, next, trailing, i, width));
      i = j - 1;
      continue;
    }
    const renderer = BLOCK_RENDERERS.get(node.type);
    out.push(renderer ? renderer(node, i, width) : null);
  }
  return out;
}
