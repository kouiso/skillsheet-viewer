/**
 * PDF 描画で共有する Text ラッパー・配色・寸法定数・スタイル。
 *
 * skill-sheet-document.tsx が 600 行近くまで膨らみ、
 * 「描画のどこを直すとどこに響くか」が読み取れなくなっていたため切り出した。
 * ここは値の定義だけを持ち、mdast の走査は render-nodes.tsx が持つ。
 */
import { Text as PdfText, StyleSheet } from '@react-pdf/renderer';
import type { ComponentProps, ComponentType } from 'react';

import { DESIGN_TOKENS_LIGHT } from '@/lib/design-tokens';

import PDF_FONT_FAMILY from './constants';
import { COLUMN, FONT_SIZE, HEADING_DEPTH, LINE_HEIGHT, PAGE, SPACING } from './layout-metrics';

// @react-pdf/textkit の getNodes() は、非空白シラブルの直後が厳密に半角スペース ' ' で
// ない限り hyphenated:true を立て、penalty ノード（既定 hyphenPenalty=600）を追加する。
// splitForHyphenation()（pdf/fonts.ts）が挟む BREAK_MARKER は ' ' と一致しないため、
// CJK文字や長い語の分割位置の直後には常にこの penalty ノードが付いてしまう。K&P改行
// 選択がこのブレークポイントを選んだ場合、breakLines() が実際にハイフン記号(U+002D)を
// 挿入する（隣接する BREAK_MARKER 境界＝penalty=0のglueブレークの方がdemeritは低く
// 通常は選ばれないが、狭い列幅では選ばれうる。Issue #171 Codexレビュー指摘）。
// hyphenationPenalty は Text ノード単位のプロパティ（node.props を直接読む実装で、
// 公開型には未定義）で、十分大きい値にすればこのブレークポイントを事実上選択不可能に
// し、BREAK_MARKER 境界を常に優先させられる。
const HYPHENATION_PENALTY_SUPPRESSED = 100000;
type LocalTextProps = ComponentProps<typeof PdfText> & { hyphenationPenalty?: number };
const PdfTextEx = PdfText as unknown as ComponentType<LocalTextProps>;
export function Text({ hyphenationPenalty = HYPHENATION_PENALTY_SUPPRESSED, ...props }: LocalTextProps) {
  return <PdfTextEx hyphenationPenalty={hyphenationPenalty} {...props} />;
}

// Console テーマ（globals.css の light トークン）に合わせたデザイントークン。
// 値は design-tokens.ts を単一の真実として import し、globals.css との乖離を
// design-tokens.test.ts で機械検証する（PDF は CSS 変数を直接解決できないため）。
export const COLOR = {
  primary: DESIGN_TOKENS_LIGHT.primary,
  primaryDark: DESIGN_TOKENS_LIGHT.primaryDark,
  text: DESIGN_TOKENS_LIGHT.foreground,
  textSecondary: DESIGN_TOKENS_LIGHT.mutedForeground,
  divider: DESIGN_TOKENS_LIGHT.border,
  headerBg: DESIGN_TOKENS_LIGHT.muted,
  codeBg: DESIGN_TOKENS_LIGHT.muted,
} as const;

// ロジック中で使う数値（マジックナンバー回避のため定数化）。テストから直接
// 参照できるよう export する（CodeRabbit レビュー指摘: 回帰テストが閾値を
// ハードコードすると、実装側で変更してもテストが追従せず静かに意味を失う）。
// ページ幾何・文字サイズ・余白は layout-metrics.ts が単一の真実。
export const NUM = {
  HEADING_H1: HEADING_DEPTH.H1,
  HEADING_H2: HEADING_DEPTH.H2,
  HEADING_H3: HEADING_DEPTH.H3,
  WEIGHT_BOLD: 700,
  WEIGHT_NORMAL: 400,
  TWO_COLUMN: COLUMN.TWO,
  COL_LABEL_FLEX: COLUMN.LABEL_FLEX,
  COL_VALUE_FLEX: COLUMN.VALUE_FLEX,
  // 見出しの直後に最低限これだけの高さが同じページに続かなければ、見出しごと
  // 次ページへ送る（本文 10.5pt / 行送り 1.6 で約 3 行分）。案件見出し（■）だけで
  // なく通常の `##` 見出しにも適用する（Issue #263 D: 通常見出しがページ末尾に
  // 取り残されていた）。
  MIN_PRESENCE_HEADING: 48,
} as const;

export const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE.PADDING_TOP,
    paddingBottom: PAGE.PADDING_BOTTOM,
    paddingHorizontal: PAGE.PADDING_HORIZONTAL,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: FONT_SIZE.BODY,
    lineHeight: LINE_HEIGHT,
    color: COLOR.text,
  },
  titleWrap: { marginBottom: SPACING.TITLE_MARGIN_BOTTOM },
  title: {
    fontSize: FONT_SIZE.TITLE,
    fontWeight: 700,
    color: COLOR.primary,
    borderBottomWidth: SPACING.TITLE_BORDER,
    borderBottomColor: COLOR.primary,
    paddingBottom: SPACING.TITLE_PADDING_BOTTOM,
  },
  headingWrap: { marginTop: SPACING.HEADING_MARGIN_TOP, marginBottom: SPACING.HEADING_MARGIN_BOTTOM },
  h1: {
    fontSize: FONT_SIZE.H1,
    fontWeight: 700,
    color: COLOR.primary,
    borderBottomWidth: SPACING.H1_BORDER,
    borderBottomColor: COLOR.primary,
    paddingBottom: SPACING.H1_PADDING_BOTTOM,
  },
  h2: {
    fontSize: FONT_SIZE.H2,
    fontWeight: 700,
    color: COLOR.text,
    borderBottomWidth: SPACING.H2_BORDER,
    borderBottomColor: COLOR.divider,
    paddingBottom: SPACING.H2_PADDING_BOTTOM,
  },
  h3: { fontSize: FONT_SIZE.H3, fontWeight: 700, color: COLOR.primaryDark },
  h4: { fontSize: FONT_SIZE.H4, fontWeight: 700, color: COLOR.text },
  hProject: { color: COLOR.primary },
  paragraphWrap: { marginBottom: SPACING.PARAGRAPH_MARGIN_BOTTOM },
  paragraph: { textAlign: 'left' },
  bold: { fontWeight: 700 },
  italic: { fontStyle: 'italic' },
  strike: { textDecoration: 'line-through' },
  // Courier は CJK 字形を持たず日本語が tofu になるため、登録済みの Noto Sans JP を使う。
  // 等幅よりも日本語が確実に描画されることを優先する。
  inlineCode: { fontFamily: PDF_FONT_FAMILY, fontSize: FONT_SIZE.CODE, backgroundColor: COLOR.codeBg },
  link: { color: COLOR.primary, textDecoration: 'underline' },
  list: { marginBottom: SPACING.LIST_MARGIN_BOTTOM, marginTop: SPACING.LIST_MARGIN_TOP },
  listItem: { flexDirection: 'row', marginBottom: SPACING.LIST_ITEM_MARGIN_BOTTOM },
  listBullet: { width: SPACING.LIST_BULLET_WIDTH, color: COLOR.primary },
  listContent: { flex: 1 },
  blockquote: {
    borderLeftWidth: SPACING.BLOCKQUOTE_BORDER_LEFT,
    borderLeftColor: COLOR.primary,
    paddingLeft: SPACING.BLOCKQUOTE_PADDING_LEFT,
    marginVertical: SPACING.BLOCKQUOTE_MARGIN_VERTICAL,
    color: COLOR.textSecondary,
  },
  hr: {
    borderBottomWidth: SPACING.HR_BORDER,
    borderBottomColor: COLOR.divider,
    marginVertical: SPACING.HR_MARGIN_VERTICAL,
  },
  codeBlock: {
    backgroundColor: COLOR.codeBg,
    padding: SPACING.CODE_PADDING,
    marginVertical: SPACING.CODE_MARGIN_VERTICAL,
    // Courier は CJK 字形を持たないため、日本語を含むコードでも描画できる Noto Sans JP を使う。
    fontFamily: PDF_FONT_FAMILY,
    fontSize: FONT_SIZE.CODE,
  },
  table: {
    marginVertical: SPACING.TABLE_MARGIN_VERTICAL,
    width: '100%',
    borderTopWidth: SPACING.TABLE_BORDER,
    borderTopColor: COLOR.divider,
    borderLeftWidth: SPACING.TABLE_BORDER,
    borderLeftColor: COLOR.divider,
  },
  tableRow: { flexDirection: 'row', width: '100%' },
  tableCell: {
    padding: SPACING.CELL_PADDING,
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderRightWidth: SPACING.TABLE_BORDER,
    borderRightColor: COLOR.divider,
    borderBottomWidth: SPACING.TABLE_BORDER,
    borderBottomColor: COLOR.divider,
  },
  tableHeaderCell: { backgroundColor: COLOR.headerBg },
  cellText: { fontSize: FONT_SIZE.CELL },
  footer: {
    position: 'absolute',
    bottom: SPACING.FOOTER_BOTTOM,
    left: PAGE.PADDING_HORIZONTAL,
    right: PAGE.PADDING_HORIZONTAL,
    // height（固定高）を与えると、fixed かつ render を持つ動的ノードが最終 PDF に
    // 一度も描画されなくなる（Issue #263 B。@react-pdf/renderer 4.5.x で実測）。
    // 高さの発散を抑えつつ描画は残す maxHeight を使う。
    maxHeight: SPACING.FOOTER_MAX_HEIGHT,
    lineHeight: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.FOOTER,
    color: COLOR.textSecondary,
  },
});

export type PdfStyle = (typeof styles)[keyof typeof styles];
