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
 *    → 開始ページを覚える処理は `subPageNumber` を持つ呼び出しだけを見る。
 */

import { Link, Text as PdfText, StyleSheet, View } from '@react-pdf/renderer';
import type { ComponentProps, ComponentType, ReactNode } from 'react';

import { isSafeLinkHref } from '@/lib/markdown-config';
import PDF_FONT_FAMILY from './constants';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintChip, PrintMetaRow, PrintTechGroup } from './print-view-model';

// @react-pdf/textkit は CJK の直後に必ずハイフネーションの penalty ノードを立てるため、
// 狭い列幅ではハイフン記号が本文に混入する。penalty を十分大きくして事実上選択不可能にする
// （既存の PDF 経路と同じ対策。詳細は skill-sheet-document.tsx の同名定数のコメント）。
const HYPHENATION_PENALTY_SUPPRESSED = 100000;
type PrintTextProps = ComponentProps<typeof PdfText> & { hyphenationPenalty?: number };
const PdfTextEx = PdfText as unknown as ComponentType<PrintTextProps>;

/** 本文用の Text。ハイフン混入対策を既定で入れる。 */
export function PrintText({ hyphenationPenalty = HYPHENATION_PENALTY_SUPPRESSED, ...props }: PrintTextProps) {
  return <PdfTextEx hyphenationPenalty={hyphenationPenalty} {...props} />;
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

/**
 * カードの「開始ページ」を覚える器。
 *
 * `render` は分割中にも呼ばれ、その呼び出しは `subPageNumber` を持たず、まだそのページに
 * 存在しないカードにも来る（実測）。だから確定パスだけを見る。さらに順序に依存しないよう
 * 「見た中の最小ページ番号」を保持する — 順序が崩れても継続表記が 1 個ズレるだけで、
 * ヘッダー自体が消えることはない。
 *
 * ドキュメント 1 回の描画ごとに新しく作ること（モジュール変数にすると前回の描画が残る）。
 */
export function createFirstPageTracker() {
  const firstPageById = new Map<string, number>();
  return {
    /** 確定パスの呼び出しだけを記録し、この呼び出しが継続ページかを返す。 */
    isContinuation(id: string, props: PageRenderProps): boolean {
      if (props.subPageNumber === undefined) return false;
      const known = firstPageById.get(id);
      if (known === undefined || props.pageNumber < known) {
        firstPageById.set(id, props.pageNumber);
        return false;
      }
      return props.pageNumber > known;
    },
  };
}

/**
 * ある単位（会社・案件）が「指定ページの先頭で、まだ閉じずに続いているか」を、
 * 開始・終了マーカーの記録から判定する器。
 *
 * 素朴に「開始 < 対象ページ ≦ 終了」で判定すると 2 通りの実測の壊れ方をした
 * （zz-pagelevel-span-probe.node.test.tsx）:
 *  1. 終了を「見た最大値」で記録すると、3 ページ以上に跨る単位の**中間ページ**では
 *     終了マーカーにまだ到達しておらず（@react-pdf の確定パスはページを文書順に
 *     確定させるため、未来のページの内容はまだ評価されていない）、終了が開始と
 *     同じ値のまま＝「同じページで閉じた」と誤判定した。
 *  2. 「今どの単位が開いているか」という 1 個のポインタを開始で立て・終了で下ろす
 *     方式に変えると 1. は直るが、**同じページの中で前の単位が終わり次の単位が
 *     始まる**とポインタが新しい方に付け替わり、そのページの先頭（実際は前の単位の
 *     続き）を新しい単位の名前で誤表示した。また、文書末尾の単位は「次に開始する
 *     ものが無い」ため、自分自身の最終ページでポインタが下りたまま照会され、
 *     続き表示が消えた。
 *
 * 正しい形: 終了は「見た値」をそのまま使わず、**未確定（undefined）と確定した値を
 * 区別する**。対象ページより前に開始した単位のうち最後に開始したものを選び、
 * その終了が「まだ未確定」または「対象ページ以上」なら開いていると判定する。
 * 未確定はまだ終了マーカーに到達していない＝続いている可能性を残す、という
 * 文書順の確定パスの性質にそのまま対応する。
 */
export function createSpanTracker() {
  interface Span {
    label: string;
    start: number;
    /** 終了マーカーにまだ到達していなければ undefined（＝まだ続いている可能性がある）。 */
    end: number | undefined;
  }
  const byId = new Map<string, Span>();
  const order: Span[] = [];
  return {
    /** 単位の最初の内容が乗ったところで呼ぶ（確定パスのみ）。1 つの id につき最初の 1 回だけ記録する。 */
    markStart(id: string, label: string, props: PageRenderProps): void {
      if (props.subPageNumber === undefined || byId.has(id)) return;
      const span: Span = { label, start: props.pageNumber, end: undefined };
      byId.set(id, span);
      order.push(span);
    },
    /** 単位の最後の内容が乗ったところで呼ぶ（確定パスのみ）。まだ未確定なら終了ページを確定する。 */
    markEnd(id: string, props: PageRenderProps): void {
      if (props.subPageNumber === undefined) return;
      const span = byId.get(id);
      if (span && span.end === undefined) span.end = props.pageNumber;
    },
    /** 指定ページの先頭で開いている単位のラベルを返す（無ければ undefined）。 */
    openLabel(pageNumber: number): string | undefined {
      let latest: Span | undefined;
      for (const span of order) {
        if (span.start < pageNumber && (latest === undefined || span.start > latest.start)) latest = span;
      }
      if (!latest) return undefined;
      if (latest.end !== undefined && latest.end < pageNumber) return undefined;
      return latest.label;
    },
  };
}

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
  footerText: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label },

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
  techGroups: { flexDirection: 'column', gap: 5 },
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
export function RunningFooter({ name, sheetTitle }: { name: string; sheetTitle: string }) {
  const left = [name, sheetTitle].filter(Boolean).join(' ／ ');
  return (
    <DynamicView
      fixed
      style={styles.footer}
      render={({ pageNumber, totalPages }) => (
        <>
          <PrintText style={styles.footerText}>{left}</PrintText>
          <PrintText style={styles.footerText}>{`${pageNumber} / ${totalPages}`}</PrintText>
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
 * 技術スタック（分類ラベル + チップ）。
 *
 * 件数の上限は無い（元データを全件表示する標準指示）。1 分類のチップ行は
 * `wrap={false}` にして、ページ跨ぎでチップが半端に切れた塊が下端に残らないようにする
 * （実測: 塗りチップ 1 個 + 文字の無い枠線チップ 2 個が下端に残り、次ページで表全体が
 * 再度描かれていた）。分類が複数あるときは分類同士の間でだけページを送ってよい。
 */
export function TechChipGroups({ groups }: { groups: PrintTechGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <View style={styles.techGroups}>
      {groups.map((group) => (
        <View key={group.label} style={styles.techGroup} wrap={false}>
          <PrintText style={styles.techLabel}>{group.label}</PrintText>
          <View style={styles.techChips}>
            {group.chips.map((chip) => (
              <Chip key={chip.label} chip={chip} />
            ))}
          </View>
        </View>
      ))}
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
export function BulletRow({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <PrintText style={styles.bulletMark}>—</PrintText>
      <PrintText style={styles.bulletBody}>{children}</PrintText>
    </View>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <PrintText style={styles.paragraph}>{children}</PrintText>;
}

export { isSafeLinkHref, Link };
