/**
 * 印刷デザインの共通部品。ここが @react-pdf の落とし穴を全部吸収する。
 *
 * `react-pdf-capability.node.test.tsx` で実測して固定した前提のうち、
 * 描画コードが守らないと静かに壊れるものは次の 3 つ。**この 3 つはここでしか扱わない。**
 *
 * 1. `Text` に明示的な `height` を与えると、その Text は描画されない。
 *    → 高さは中身に任せる。`height` を書かない。
 * 2. `render` prop を持つ `Text` は `lineHeight` を指定すると描画されない。
 *    → 動的な内容は `DynamicView`（View 側の render）で受け、中で普通の Text を返す。
 * 3. `render` は 1 ページにつき 2 回呼ばれ、1 回目（分割中）は `subPageNumber` を持たず、
 *    まだそのページに無いカードに対しても呼ばれる。
 *    → 動的な判断は `subPageNumber` を持つ呼び出しだけを見る（1 ページ目・スキル一覧の
 *      継続見出し）。案件セクションは measure-then-place で静的にページを決めるので、
 *      `render` に頼らない（print-leaves.tsx / print-pages.tsx）。
 */

import { Link, Text as PdfText, StyleSheet, View } from '@react-pdf/renderer';
import type { ComponentProps, ComponentType, ReactNode } from 'react';

import { isSafeLinkHref } from '@/lib/markdown-config';
import PDF_FONT_FAMILY from './constants';
import { toRenderableText } from './glyph-coverage';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintChip, PrintMetaRow, PrintTechGroup } from './print-view-model';

// @react-pdf/textkit は CJK の直後に必ずハイフネーションの penalty ノードを立てるため、
// 狭い列幅ではハイフン記号が本文に混入する。penalty を十分大きくして事実上選択不可能にする
// （既存の PDF 経路と同じ対策。詳細は skill-sheet-document.tsx の同名定数のコメント）。
const HYPHENATION_PENALTY_SUPPRESSED = 100000;
type PrintTextProps = ComponentProps<typeof PdfText> & { hyphenationPenalty?: number };
const PdfTextEx = PdfText as unknown as ComponentType<PrintTextProps>;

/**
 * children のうち生の文字列だけを toRenderableText へ通す。
 *
 * ネストした要素（print-markdown.tsx が組む `<PrintText style={styles.strong}>…</PrintText>`
 * の入れ子等）はそれぞれ自分の PrintText で処理されるので、ここでは文字列と配列だけを
 * 見て要素・null・数値はそのまま素通しする（二重処理はしないが、しても toRenderableText は
 * 冪等なので害はない）。
 */
function sanitizeChildren(node: ReactNode): ReactNode {
  if (typeof node === 'string') return toRenderableText(node);
  if (Array.isArray(node)) return node.map(sanitizeChildren);
  return node;
}

/**
 * 本文用の Text。ハイフン混入対策に加え、PDF に載る文字列は必ずここを通して
 * 登録フォントが描けない文字（絵文字・補助面の拡張漢字等）を安全な代替へ倒す。
 *
 * @react-pdf/renderer 4.5.x は補助面文字のサブセット化・エンコードを正しく扱えず、
 * 無関係なグリフが送り幅 0 で描かれて直後の文字まで潰す（glyph-coverage.ts 参照）。
 * レガシー markdown 経路（render-nodes.tsx）は toRenderableText を自前で呼んでいるが、
 * この印刷デザイン経路（DB 由来の全案件カード・1 ページ目・footer 等）はここを通る
 * PrintText が唯一の共通出口なので、個々の呼び出し元（print-view-model.ts 等）で
 * サニタイズを分散させず、ここ 1 箇所で担保する。
 */
export function PrintText({ hyphenationPenalty = HYPHENATION_PENALTY_SUPPRESSED, ...props }: PrintTextProps) {
  // PrintTextProps は react-pdf 側の型が `PropsWithChildren<TextProps> | SVGTextProps` という
  // union のため、`children` は分割代入で直接名前を取れない（SVGTextProps 側に無い）。
  // `in` で絞ってから読む。
  const rawChildren: ReactNode = 'children' in props ? props.children : undefined;
  return (
    <PdfTextEx hyphenationPenalty={hyphenationPenalty} {...props}>
      {sanitizeChildren(rawChildren)}
    </PdfTextEx>
  );
}

/** fixed な running header / footer と、カードの継続ヘッダーに渡る値。 */
export interface PageRenderProps {
  pageNumber: number;
  totalPages: number;
  /** Page 単位の相対ページ番号。**分割中の呼び出しでは undefined。** */
  subPageNumber?: number;
  subPageTotalPages?: number;
}

/**
 * `render` prop を受け取れる View。
 *
 * `render` は @react-pdf の公開型に無い（実装が `node.props` を直接読む）ため、
 * 型はここで 1 箇所だけ緩める。呼び出し側は普通の props として扱える。
 */
export const DynamicView = View as unknown as ComponentType<{
  fixed?: boolean;
  style?: ComponentProps<typeof View>['style'];
  render: (props: PageRenderProps) => ReactNode;
}>;

const styles = StyleSheet.create({
  page: {
    paddingTop: PRINT_SIZE.padTop,
    paddingBottom: PRINT_SIZE.padBottom + 14,
    paddingHorizontal: PRINT_SIZE.padHorizontal,
    fontFamily: PDF_FONT_FAMILY,
    color: PRINT_COLOR.text,
    ...PRINT_TYPE.body,
  },
  // fixed な running footer。**height を与えないこと**（与えると描画が消える）。
  footer: {
    position: 'absolute',
    bottom: PRINT_SIZE.footerBottom,
    left: PRINT_SIZE.padHorizontal,
    right: PRINT_SIZE.padHorizontal,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: PRINT_SIZE.ruleThin,
    borderTopColor: PRINT_COLOR.rule,
    paddingTop: 5,
  },
  footerIdentity: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label, flexShrink: 1 },
  footerCounter: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label, flexShrink: 0 },

  sectionLabel: { ...PRINT_TYPE.sectionLabel, color: PRINT_COLOR.heading, letterSpacing: 0.4 },

  chipSolid: {
    ...PRINT_TYPE.meta,
    fontWeight: PRINT_WEIGHT.bold,
    color: PRINT_COLOR.paper,
    backgroundColor: PRINT_COLOR.accent,
    borderRadius: PRINT_SIZE.chipRadius,
    paddingVertical: PRINT_SIZE.chipPadVertical,
    paddingHorizontal: PRINT_SIZE.chipPadHorizontal,
  },
  chipOutline: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.text,
    borderWidth: PRINT_SIZE.ruleThin,
    borderColor: PRINT_COLOR.rule,
    borderRadius: PRINT_SIZE.chipRadius,
    paddingVertical: PRINT_SIZE.chipPadVertical,
    paddingHorizontal: PRINT_SIZE.chipPadHorizontal,
  },
  chipBand: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.heading,
    backgroundColor: PRINT_COLOR.band,
    borderRadius: PRINT_SIZE.chipRadius,
    paddingVertical: PRINT_SIZE.chipPadVertical,
    paddingHorizontal: PRINT_SIZE.chipPadHorizontal,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: PRINT_SIZE.chipGap },

  techGroup: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  // 分類同士の間隔。分類ごとに葉になるので、間隔は葉の枠（print-leaves.tsx）が持つ。
  // 自動改ページのページで使うときだけ 2 つ目以降に付ける。
  techGroupSpaced: { marginTop: 5 },
  techLabel: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.label,
    width: PRINT_SIZE.labelColTech,
    flexShrink: 0,
    paddingTop: PRINT_SIZE.chipPadVertical,
  },
  techChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: PRINT_SIZE.chipGap },

  metaColumns: { flexDirection: 'row' },
  metaColumn: { flex: 1, flexDirection: 'column' },
  metaColumnDivider: { borderRightWidth: PRINT_SIZE.ruleThin, borderRightColor: PRINT_COLOR.rule },
  metaRow: {
    flexDirection: 'row',
    paddingVertical: PRINT_SIZE.metaRowPadVertical,
    paddingHorizontal: PRINT_SIZE.metaRowPadHorizontal,
  },
  metaRowDivider: { borderBottomWidth: PRINT_SIZE.ruleThin, borderBottomColor: PRINT_COLOR.ruleFaint },
  metaLabel: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label, width: PRINT_SIZE.labelColMeta, flexShrink: 0 },
  metaValue: { ...PRINT_TYPE.meta, color: PRINT_COLOR.text, flex: 1 },

  bulletRow: { flexDirection: 'row', gap: 6 },
  bulletMark: { ...PRINT_TYPE.body, color: PRINT_COLOR.accent },
  bulletBody: { ...PRINT_TYPE.body, color: PRINT_COLOR.text, flex: 1 },
  paragraph: { ...PRINT_TYPE.body, color: PRINT_COLOR.text },
  strong: { fontWeight: PRINT_WEIGHT.bold, color: PRINT_COLOR.heading },
  link: { color: PRINT_COLOR.accent, textDecoration: 'underline' },
});

export const printStyles = styles;

/** 全ページに繰り返すフッター（氏名 ／ シート名 と ページ番号）。 */
/** footer の左側に置ける全角文字数の目安（本文幅 515pt / 11pt、ページ番号ぶんを除く）。 */
const FOOTER_IDENTITY_MAX_CHARS = 42;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function RunningFooter({ name, sheetTitle }: { name: string; sheetTitle: string }) {
  // 氏名とシート名は長さに上限が無い。折り返すと固定要素なので全ページでページ番号に
  // 重なるため、ここで 1 行に収まる長さへ落とす（左は縮む・右は縮まない指定と併用する）。
  const left = truncate([name, sheetTitle].filter(Boolean).join(' ／ '), FOOTER_IDENTITY_MAX_CHARS);
  return (
    <DynamicView
      fixed
      style={styles.footer}
      render={({ pageNumber, totalPages }) => (
        <>
          {/* 氏名とシート名は長さに上限が無い。1 行に収める指定が無いと本文側へ折り返し、
              固定要素なので全ページでページ番号に重なる。左は縮む・1 行、右は縮まない。 */}
          <PrintText style={styles.footerIdentity}>{left}</PrintText>
          <PrintText style={styles.footerCounter}>{`${pageNumber} / ${totalPages}`}</PrintText>
        </>
      )}
    />
  );
}

/** 小見出し（業務内容 / 習得スキル・実績 / コメント 等）。 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <PrintText style={styles.sectionLabel}>{children}</PrintText>;
}

export function Chip({ chip }: { chip: PrintChip }) {
  return <PrintText style={chip.emphasis === 'solid' ? styles.chipSolid : styles.chipOutline}>{chip.label}</PrintText>;
}

/** 帯色のチップ（対応可能工程）。 */
export function BandChip({ label }: { label: string }) {
  return <PrintText style={styles.chipBand}>{label}</PrintText>;
}

export function ChipRow({ chips }: { chips: PrintChip[] }) {
  if (chips.length === 0) return null;
  return (
    <View style={styles.chipRow}>
      {chips.map((chip) => (
        <Chip key={chip.label} chip={chip} />
      ))}
    </View>
  );
}

/**
 * 技術スタックの 1 分類（ラベル + チップ）。
 *
 * 件数の上限は無い（元データを全件表示する標準指示）。分類 1 つが measure-then-place の
 * 葉 1 つになるので、チップ行がページ跨ぎで半端に切れることは構造上起きない。
 * `spaced` は 2 つ目以降の分類に付け、分類同士の間隔を作る。
 */
export function TechChipGroup({ group, spaced }: { group: PrintTechGroup; spaced: boolean }) {
  return (
    <View style={spaced ? [styles.techGroup, styles.techGroupSpaced] : styles.techGroup}>
      <PrintText style={styles.techLabel}>{group.label}</PrintText>
      <View style={styles.techChips}>
        {group.chips.map((chip) => (
          <Chip key={chip.label} chip={chip} />
        ))}
      </View>
    </View>
  );
}

/**
 * メタ表。デザインは 2 列だが、行数が奇数のときに右列が 1 行短くなるのを避けるため、
 * 行を左右へ交互ではなく前半・後半で分ける（読む順が縦になる）。
 */
export function MetaTable({ rows }: { rows: PrintMetaRow[] }) {
  if (rows.length === 0) return null;
  const half = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, half), rows.slice(half)].filter((column) => column.length > 0);
  return (
    <View style={styles.metaColumns}>
      {columns.map((column, columnIndex) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: 列は 0/1 の固定位置で、安定 id を持たない
          key={columnIndex}
          style={[styles.metaColumn, columnIndex < columns.length - 1 ? styles.metaColumnDivider : {}]}
        >
          {column.map((row, rowIndex) => (
            <View key={row.label} style={[styles.metaRow, rowIndex < column.length - 1 ? styles.metaRowDivider : {}]}>
              <PrintText style={styles.metaLabel}>{row.label}</PrintText>
              <PrintText style={styles.metaValue}>{row.value}</PrintText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** 箇条書き 1 行（記号はアクセント色のダッシュ）。 */
/** 行頭記号は既定でダッシュ。順序付きリストは `1.` `2.` を渡して番号を保つ。 */
/**
 * 箇条書きの 1 項目。
 *
 * 記号と本文は別の `Text` にした flex 行なので、行がページの境目に当たると
 * @react-pdf が記号（`—`）側だけを前のページの下端に残す。これを `wrap={false}` で
 * 割れなくするだけでは直らず、下端の突き抜けが増えた（実測: 46 ページ版）。原因は
 * 箇条書きの行が親（`print-markdown.tsx` の項目 View）の**最初の子**に来ることで、
 * @react-pdf は「親の最初の子は既にページ先頭にいる」と見なして改ページの判断自体を
 * 省き、ページが埋まっていてもその場に描くため（`project-card-compact.tsx` の
 * コメントと同じ仕組み）。
 *
 * だから **高さ 0 の先行兄弟 + `wrap={false}`** の 2 つを必ずセットで出す。兄弟が 1 つ
 * あるだけで最初の子の判定が外れ、収まらない行は記号ごと次ページへ送られる。
 * 兄弟は行の外（この fragment の先頭）に置く — 行の中に入れると flex 行の
 * 1 列目になり、記号が右へずれる。
 *
 * 却下した案: 1 つの `Text` にまとめて負の `textIndent` で 1 行目だけ左へ戻す
 * （ぶら下げインデント）→ @react-pdf は `textIndent` の符号を無視して 1 行目を右へ
 * 送るので、字下げが逆になった。
 *
 * 残る制約: 1 項目が 1 ページ（754pt ≒ 37 行）を超えると `wrap={false}` は
 * ページ送りではなく圧縮を起こす。実データの最長項目は 4 行で、桁が 1 つ違う。
 */
export function BulletRow({ children, marker = '—' }: { children: ReactNode; marker?: string }) {
  return (
    <>
      <View />
      <View style={styles.bulletRow} wrap={false}>
        <PrintText style={styles.bulletMark}>{marker}</PrintText>
        <PrintText style={styles.bulletBody}>{children}</PrintText>
      </View>
    </>
  );
}

/**
 * 箇条書き 1 項目（measure-then-place の葉として置く形）。
 *
 * `BulletRow` と違い、先行兄弟も `wrap={false}` も持たない。葉は割り付け側が必ず 1 ページに
 * 収まる位置へ置くので、@react-pdf の改ページ判定に介入する必要が無い。
 */
export function BulletLine({ children, marker = '—' }: { children: ReactNode; marker?: string }) {
  return (
    <View style={styles.bulletRow}>
      <PrintText style={styles.bulletMark}>{marker}</PrintText>
      <PrintText style={styles.bulletBody}>{children}</PrintText>
    </View>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <PrintText style={styles.paragraph}>{children}</PrintText>;
}

export { isSafeLinkHref, Link };
