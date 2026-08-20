import { hardBreakCount, type MdNode, nodeText } from './mdast';

// PDF のページ幾何とタイポグラフィの数値をここに集約する。skill-sheet-document.tsx の
// StyleSheet と、下の高さ見積りの双方がこの定数だけを読むので、片方だけ変えて
// 見積りが実レイアウトから静かにずれる、という事故が起きない。
export const PAGE = {
  // A4（@react-pdf の size="A4"）。
  WIDTH: 595.28,
  HEIGHT: 841.89,
  PADDING_TOP: 40,
  PADDING_BOTTOM: 48,
  PADDING_HORIZONTAL: 44,
} as const;

/** 本文が使える横幅（pt）。 */
export const CONTENT_WIDTH = PAGE.WIDTH - PAGE.PADDING_HORIZONTAL * 2;
/** 1 ページに載せられる縦幅（pt）。 */
export const CONTENT_HEIGHT = PAGE.HEIGHT - PAGE.PADDING_TOP - PAGE.PADDING_BOTTOM;

// 本文 10.5pt を基準に、見出し・表・コードのバランスを取り直したサイズ（Issue #263 G）。
export const FONT_SIZE = {
  BODY: 10.5,
  TITLE: 21,
  H1: 17,
  H2: 14,
  H3: 12.5,
  H4: 11.5,
  CELL: 10,
  CODE: 9.5,
  FOOTER: 9,
} as const;

export const LINE_HEIGHT = 1.6;

export const SPACING = {
  TITLE_MARGIN_BOTTOM: 14,
  TITLE_PADDING_BOTTOM: 6,
  TITLE_BORDER: 2,
  HEADING_MARGIN_TOP: 12,
  HEADING_MARGIN_BOTTOM: 6,
  H1_BORDER: 2,
  H1_PADDING_BOTTOM: 4,
  H2_BORDER: 1,
  H2_PADDING_BOTTOM: 3,
  PARAGRAPH_MARGIN_BOTTOM: 5,
  LIST_MARGIN_TOP: 2,
  LIST_MARGIN_BOTTOM: 6,
  LIST_ITEM_MARGIN_BOTTOM: 2,
  LIST_BULLET_WIDTH: 14,
  BLOCKQUOTE_BORDER_LEFT: 3,
  BLOCKQUOTE_PADDING_LEFT: 8,
  BLOCKQUOTE_MARGIN_VERTICAL: 6,
  HR_MARGIN_VERTICAL: 10,
  HR_BORDER: 1,
  CODE_PADDING: 6,
  CODE_MARGIN_VERTICAL: 6,
  TABLE_MARGIN_VERTICAL: 6,
  TABLE_BORDER: 1,
  CELL_PADDING: 4,
  FOOTER_BOTTOM: 18,
  // height ではなく maxHeight で高さを抑える理由は skill-sheet-document.tsx の footer 参照。
  FOOTER_MAX_HEIGHT: 12,
} as const;

export const COLUMN = {
  TWO: 2,
  LABEL_FLEX: 3,
  VALUE_FLEX: 7,
} as const;

export const HEADING_DEPTH = { H1: 1, H2: 2, H3: 3 } as const;

/** 見出しレベルごとの文字サイズ。 */
export function headingFontSize(depth: number): number {
  if (depth <= HEADING_DEPTH.H1) return FONT_SIZE.H1;
  if (depth === HEADING_DEPTH.H2) return FONT_SIZE.H2;
  if (depth === HEADING_DEPTH.H3) return FONT_SIZE.H3;
  return FONT_SIZE.H4;
}

/** 見出しレベルごとの下線（borderBottom + paddingBottom）が食う高さ。 */
function headingRuleHeight(depth: number): number {
  if (depth <= HEADING_DEPTH.H1) return SPACING.H1_BORDER + SPACING.H1_PADDING_BOTTOM;
  if (depth === HEADING_DEPTH.H2) return SPACING.H2_BORDER + SPACING.H2_PADDING_BOTTOM;
  return 0;
}

// --- 高さ見積り -----------------------------------------------------------
//
// なぜ「文字数の閾値」ではなく pt 単位の高さなのか（Issue #262）:
// 分割不可（wrap={false}）の View が 1 ページ分の高さを超えると、@react-pdf/layout の
// splitNodes() は `!fitsInsidePage && !canWrap` の枝に落ちてそのノードを現在ページへ
// そのまま押し込み、はみ出した子要素は最終 PDF から丸ごと消える（警告は出るが描画は
// 続く）。旧実装は「カード全体の合計文字数 <= 1400」で分割不可にしてよいかを決めて
// いたが、文字数は高さの代理変数として成立しない。実測（本ファイルの回帰テスト）では
// 「8 文字の段落 150 個 = 1200 文字」が閾値を通過し、実際の高さ 3000pt 超のカードが
// 分割不可になって本文 150 段落すべてが PDF から消えた。
//
// ここでは各ブロックの高さを pt で「上振れ側に」見積もる。1 文字の送り幅は最大でも
// 1em（全角）なので `文字数 * fontSize` は必ず実幅以上になり、行数 = ceil(幅/利用可能幅)
// は実際の行数以上になる。余白・枠線・パディングは実 StyleSheet と同じ定数を足す。
// これに安全率を掛けたうえで 1 ページに収まると言えるときだけ wrap={false} にする。

/** 1 文字あたりの送り幅の上限（em）。全角 CJK が 1em、ラテンはそれ未満。 */
const MAX_ADVANCE_EM = 1;

/** 見積り高さに掛ける安全率。行の詰まり方の揺れと字形差を吸収する。 */
export const HEIGHT_SAFETY_FACTOR = 1.25;

function lineCount(charCount: number, fontSize: number, availableWidth: number): number {
  if (availableWidth <= 0) return charCount > 0 ? charCount : 1;
  const width = charCount * fontSize * MAX_ADVANCE_EM;
  return Math.max(1, Math.ceil(width / availableWidth));
}

function textHeight(text: string, fontSize: number, availableWidth: number, extraLines = 0): number {
  return (lineCount(text.length, fontSize, availableWidth) + extraLines) * fontSize * LINE_HEIGHT;
}

/** 2 列表のときだけラベル列を狭くする（renderTableCell の flexGrow と同じ比率）。 */
function cellFlexGrow(columnIndex: number, columnCount: number): number {
  if (columnCount === COLUMN.TWO) return columnIndex === 0 ? COLUMN.LABEL_FLEX : COLUMN.VALUE_FLEX;
  return 1;
}

/**
 * 列数から flex 比の合計を出す。表全体の見積りと行単位の判定で必ず同じ値を使う。
 * 2 か所に書き写すと、cellFlexGrow の比率を変えたとき片方だけ追従して静かに食い違う。
 */
function totalFlexGrow(columnCount: number): number {
  return Array.from({ length: columnCount }, (_, i) => cellFlexGrow(i, columnCount)).reduce((a, b) => a + b, 0);
}

function tableHeight(node: MdNode, width: number): number {
  const rows = node.children ?? [];
  const columnCount = rows[0]?.children?.length ?? 0;
  if (columnCount === 0) return 0;
  const flexTotal = totalFlexGrow(columnCount);
  // 表全体の左枠線 1pt を引いた残りを flex 比で分配する。
  const innerWidth = Math.max(0, width - SPACING.TABLE_BORDER);
  let height = SPACING.TABLE_MARGIN_VERTICAL * 2 + SPACING.TABLE_BORDER;
  for (const row of rows) {
    height += tableRowHeight(row, columnCount, flexTotal, innerWidth);
  }
  return height;
}

/** 表 1 行の高さ。行単位の wrap 判定（renderTable）からも直接使う。 */
export function tableRowHeight(row: MdNode, columnCount: number, flexTotal: number, innerWidth: number): number {
  let tallest = 0;
  const cells = row.children ?? [];
  for (let i = 0; i < cells.length; i++) {
    const share = (innerWidth * cellFlexGrow(i, columnCount)) / flexTotal;
    // セルは padding 4pt ×2 と右枠線 1pt を内側から食う。
    const inner = share - SPACING.CELL_PADDING * 2 - SPACING.TABLE_BORDER;
    tallest = Math.max(tallest, textHeight(nodeText(cells[i]), FONT_SIZE.CELL, inner));
  }
  return tallest + SPACING.CELL_PADDING * 2 + SPACING.TABLE_BORDER;
}

/** 表 1 行分の高さを、markdown の table ノードと行から算出する便宜関数。 */
export function estimateTableRowHeight(tableNode: MdNode, row: MdNode, width: number): number {
  // `length` は 0 になり得るので `??` では拾えない。0 のまま進むと flexTotal が 0 になり、
  // share が Infinity になって高さを1行分に過小見積りする。過小見積りは wrap={false} を
  // 許す方向に働くため、Issue #262（1ページより高い分割不可ノードで本文が消える）を
  // 再発させかねない。
  const columnCount = Math.max(1, tableNode.children?.[0]?.children?.length ?? row.children?.length ?? 1);
  return tableRowHeight(row, columnCount, totalFlexGrow(columnCount), Math.max(0, width - SPACING.TABLE_BORDER));
}

function listHeight(node: MdNode, width: number): number {
  const contentWidth = Math.max(0, width - SPACING.LIST_BULLET_WIDTH);
  let height = SPACING.LIST_MARGIN_TOP + SPACING.LIST_MARGIN_BOTTOM;
  for (const item of node.children ?? []) {
    height += estimateBlocksHeight(item.children, contentWidth) + SPACING.LIST_ITEM_MARGIN_BOTTOM;
  }
  return height;
}

function codeHeight(node: MdNode, width: number): number {
  const inner = Math.max(0, width - SPACING.CODE_PADDING * 2);
  const lines = (node.value ?? '').split('\n');
  let height = SPACING.CODE_MARGIN_VERTICAL * 2 + SPACING.CODE_PADDING * 2;
  for (const line of lines) height += textHeight(line, FONT_SIZE.CODE, inner);
  return height;
}

/** ブロック 1 つ分の高さ（pt）の上振れ見積り。 */
export function estimateBlockHeight(node: MdNode, width: number): number {
  switch (node.type) {
    case 'heading': {
      const depth = node.depth ?? HEADING_DEPTH.H1;
      const size = headingFontSize(depth);
      return (
        textHeight(nodeText(node), size, width) +
        headingRuleHeight(depth) +
        SPACING.HEADING_MARGIN_TOP +
        SPACING.HEADING_MARGIN_BOTTOM
      );
    }
    case 'paragraph':
      return textHeight(nodeText(node), FONT_SIZE.BODY, width, hardBreakCount(node)) + SPACING.PARAGRAPH_MARGIN_BOTTOM;
    case 'list':
      return listHeight(node, width);
    case 'table':
      return tableHeight(node, width);
    case 'blockquote':
      return (
        SPACING.BLOCKQUOTE_MARGIN_VERTICAL * 2 +
        estimateBlocksHeight(
          node.children,
          Math.max(0, width - SPACING.BLOCKQUOTE_BORDER_LEFT - SPACING.BLOCKQUOTE_PADDING_LEFT),
        )
      );
    case 'thematicBreak':
      return SPACING.HR_MARGIN_VERTICAL * 2 + SPACING.HR_BORDER;
    case 'code':
      return codeHeight(node, width);
    case 'html': {
      const text = (node.value ?? '').replace(/<[^>]*>/g, '').trim();
      if (!text) return 0;
      // renderHtmlBlock は見出しタグを含むときだけ h2 相当で描く。
      if (/<h[1-6][\s>]/i.test(node.value ?? '')) {
        return (
          textHeight(text, FONT_SIZE.H2, width) +
          SPACING.H2_BORDER +
          SPACING.H2_PADDING_BOTTOM +
          SPACING.HEADING_MARGIN_TOP +
          SPACING.HEADING_MARGIN_BOTTOM
        );
      }
      return textHeight(text, FONT_SIZE.BODY, width) + SPACING.PARAGRAPH_MARGIN_BOTTOM;
    }
    default:
      // 未知の型は描画側も何も出さない（BLOCK_RENDERERS に無い）ので 0。
      return 0;
  }
}

/** ブロック列の合計高さ（pt）。 */
export function estimateBlocksHeight(nodes: MdNode[] | undefined, width: number): number {
  if (!nodes) return 0;
  return nodes.reduce((sum, node) => sum + estimateBlockHeight(node, width), 0);
}

/**
 * 安全率込みで 1 ページに確実に収まると言えるか。true のときだけ wrap={false}
 * （分割不可）にしてよい ―― 収まると分かっているノードは、現在のページに入り
 * きらなくても react-pdf が次ページ先頭へ丸ごと送るだけで、内容が消えることはない。
 */
export function fitsWithinPage(estimatedHeight: number): boolean {
  return estimatedHeight * HEIGHT_SAFETY_FACTOR <= CONTENT_HEIGHT;
}
