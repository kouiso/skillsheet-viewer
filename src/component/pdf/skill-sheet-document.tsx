import type { ReactNode } from 'react';

import { Document, Link, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import PDF_FONT_FAMILY from './constants';
import { shouldTableWrap } from './table-layout';

// ビューア（src/index.css のライトテーマトークン）に合わせたデザイントークン
const COLOR = {
  primary: '#6366f1',
  primaryDark: '#4f46e5',
  text: '#0f172a',
  textSecondary: '#475569',
  divider: '#e2e8f0',
  headerBg: '#f8fafc',
  codeBg: '#f1f5f9',
} as const;

// ロジック中で使う数値（マジックナンバー回避のため定数化）
const NUM = {
  HEADING_H1: 1,
  HEADING_H2: 2,
  HEADING_H3: 3,
  WEIGHT_BOLD: 700,
  WEIGHT_NORMAL: 400,
  TWO_COLUMN: 2,
  COL_LABEL_FLEX: 3,
  COL_VALUE_FLEX: 7,
  MIN_PRESENCE_PROJECT: 48,
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
  inlineCode: { fontFamily: 'Courier', fontSize: 8.5, backgroundColor: COLOR.codeBg },
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
    fontFamily: 'Courier',
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

interface MdNode {
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

function renderInline(nodes: MdNode[] | undefined): ReactNode {
  if (!nodes) return null;
  return nodes.map((node, i) => renderInlineNode(node, i));
}

function renderInlineNode(node: MdNode, key: number): ReactNode {
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
    return (
      <Link key={key} src={node.url ?? ''} style={styles.link}>
        {renderInline(node.children)}
      </Link>
    );
  }
  const style = INLINE_STYLE.get(node.type);
  if (style) {
    return (
      <Text key={key} style={style}>
        {renderInline(node.children)}
      </Text>
    );
  }
  return node.children ? renderInline(node.children) : (node.value ?? null);
}

// --- ブロック描画 ---------------------------------------------------------

function headingStyle(depth: number): PdfStyle {
  if (depth <= NUM.HEADING_H1) return styles.h1;
  if (depth === NUM.HEADING_H2) return styles.h2;
  if (depth === NUM.HEADING_H3) return styles.h3;
  return styles.h4;
}

function renderHeading(node: MdNode, key: number): ReactNode {
  const depth = node.depth ?? NUM.HEADING_H1;
  const isProject = nodeText(node).trimStart().startsWith('■');
  const base = headingStyle(depth);
  return (
    <View key={key} style={styles.headingWrap} minPresenceAhead={isProject ? NUM.MIN_PRESENCE_PROJECT : 0}>
      <Text style={isProject ? [base, styles.hProject] : base}>{renderInline(node.children)}</Text>
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
  const inline = renderInline(cell.children);
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

function renderTable(node: MdNode, key: number): ReactNode {
  const rows = node.children ?? [];
  const columnCount = rows[0]?.children?.length ?? 0;
  if (columnCount === 0) return null;
  const align = node.align ?? [];
  return (
    <View key={key} style={styles.table} wrap={shouldTableWrap(rows.length)}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.tableRow}>
          {(row.children ?? []).map((cell, ci) => renderTableCell(cell, ci, columnCount, align, ri === 0))}
        </View>
      ))}
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

function renderBlocks(nodes: MdNode[] | undefined): ReactNode {
  if (!nodes) return null;
  return nodes.map((node, i) => {
    const renderer = BLOCK_RENDERERS.get(node.type);
    return renderer ? renderer(node, i) : null;
  });
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
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content) as unknown as MdNode;

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
