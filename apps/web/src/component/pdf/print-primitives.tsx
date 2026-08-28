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
  chipOverflow: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label, paddingVertical: PRINT_SIZE.chipPadVertical },

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

/** 技術スタック（分類ラベル + チップ + 「他 N 件」）。 */
export function TechChipGroups({ groups }: { groups: PrintTechGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <View style={styles.techGroups}>
      {groups.map((group) => (
        <View key={group.label} style={styles.techGroup}>
          <PrintText style={styles.techLabel}>{group.label}</PrintText>
          <View style={styles.techChips}>
            {group.chips.map((chip) => (
              <Chip key={chip.label} chip={chip} />
            ))}
            {group.overflowCount > 0 && (
              <PrintText style={styles.chipOverflow}>{`他 ${group.overflowCount} 件`}</PrintText>
            )}
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
