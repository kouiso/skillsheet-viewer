/**
 * 簡約版の案件カード（デザイン artboard 1d「D — 案件カード（簡約版）」）。
 *
 * デザインは 1 案件 = 1 行に畳んでいるが、**詳細版が持つ事実を 1 個も落とすことは
 * 提出書類として許されない**（本人の要件「簡易表記はあかん」、`no-abbreviated-rendering`
 * skill）。詳細版（`project-card-detail.tsx`）が出す役割・技術領域・担当工程（メタ表）と
 * 技術チップを、簡約版はこれまで丸ごと描画しておらず、完全性検査
 * （`print-completeness.node.ts`）で 234 件の欠落として実測された。そのため 2 段構成にしている。
 *
 *  - 1 段目: デザインどおりの 1 行（期間 88pt ／ 案件名 + 一言 ／ チーム 44pt）。
 *    ここだけ `wrap={false}` にして、1 行が改ページで割れないようにする。
 *  - 2 段目: 期間列の幅ぶんインデントして案件名の真下に本文を流す。メタ情報（役割・
 *    技術領域・担当工程）は表ではなく 1 行の密な文字列に、技術チップは詳細版のような
 *    分類ラベル列を持たず 1 本の折り返し行にまとめる（分類は付加情報、技術名そのものが
 *    本体という判断）。件数の上限は無い — 全件をチップに入れる。
 *    こちらは `wrap={false}` を付けない。長文・大量のチップが 1 ページに収まらないとき、
 *    @react-pdf は分割できないブロックを丸ごと次ページへ送るか溢れさせるため、
 *    2 段目は必ず分割可能にしておく必要がある。
 */

import { StyleSheet, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { PrintMarkdown } from './print-markdown';
import { Chip, DynamicView, type PageRenderProps, PrintText, SectionLabel } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintProject } from './print-view-model';

// artboard 1d の簡約表だけが持つ余白。共通トークンの metaRow 系（縦 5 / 横 12）とは別値なので、
// 流用せずここに実数で置く。横 10pt はチーム列 44pt を右端に寄せる前提で決まっている。
const ROW_PAD_VERTICAL = 7;
const ROW_PAD_HORIZONTAL = 10;
const HEAD_PAD_VERTICAL = 5;

/** 案件名と技術・一言の行間（デザインの gap:2px）。 */
const MAIN_COLUMN_GAP = 2;

/**
 * 1 つの分割禁止ブロックに入れるチップの上限。11pt のチップが 3 段折り返しても
 * 印刷領域の高さ（約 700pt）に十分収まる件数にしてある。
 */
const CHIPS_PER_UNBREAKABLE_GROUP = 18;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    backgroundColor: PRINT_COLOR.surface,
    borderBottomWidth: PRINT_SIZE.ruleThin,
    borderBottomColor: PRINT_COLOR.rule,
    paddingVertical: HEAD_PAD_VERTICAL,
    paddingHorizontal: ROW_PAD_HORIZONTAL,
  },
  headerPeriod: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.label,
    width: PRINT_SIZE.labelColCompact,
    flexShrink: 0,
  },
  headerMain: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label, flex: 1 },
  headerTeam: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.label,
    width: PRINT_SIZE.teamColCompact,
    flexShrink: 0,
    textAlign: 'right',
  },

  // デザインの 0.75pt 罫線は「1 案件と次の案件の境界」。2 段構成にした結果、
  // 1 段目の直下は自分の本文なので、罫線は 1 段目ではなく **案件まるごとの下端**に置く。
  // 1 段目に付けると「罫線の下にあるのは罫線の上の案件の本文」という読み違えを生み、
  // 本当の境界（本文 → 次の案件の期間）には線が 1 本も無い状態になる。
  // @react-pdf は View が改ページで割れたとき前半の borderBottomWidth を 0 にするので
  // （layout の splitNode）、本文が長くて割れても罫線は最終ページに 1 本だけ出る。
  projectGroup: {
    borderBottomWidth: PRINT_SIZE.ruleThin,
    borderBottomColor: PRINT_COLOR.rule,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: ROW_PAD_VERTICAL,
    paddingHorizontal: ROW_PAD_HORIZONTAL,
  },
  period: {
    ...PRINT_TYPE.meta,
    fontWeight: PRINT_WEIGHT.bold,
    color: PRINT_COLOR.heading,
    width: PRINT_SIZE.labelColCompact,
    flexShrink: 0,
  },
  main: { flex: 1, flexDirection: 'column', gap: MAIN_COLUMN_GAP },
  // 11.5pt はトークンの本文サイズ。ウェイトと行間だけデザイン（500 / 1.5）に寄せる。
  title: {
    ...PRINT_TYPE.body,
    fontWeight: PRINT_WEIGHT.medium,
    lineHeight: 1.5,
    color: PRINT_COLOR.heading,
  },
  note: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label },
  // チーム欄が空でも列そのものは残す。列を消すと隣の flex 列が広がり、
  // 行ごとに案件名の折り返し幅が変わって表が揃わなくなる。
  teamCell: { width: PRINT_SIZE.teamColCompact, flexShrink: 0 },
  teamText: { ...PRINT_TYPE.meta, color: PRINT_COLOR.text, textAlign: 'right' },

  // 期間列の幅 + 行の左余白ぶん下げて、案件名の左端に本文の左端を合わせる。
  body: {
    flexDirection: 'column',
    gap: 7,
    paddingTop: 6,
    paddingBottom: 8,
    paddingLeft: ROW_PAD_HORIZONTAL + PRINT_SIZE.labelColCompact,
    paddingRight: ROW_PAD_HORIZONTAL,
  },
  bodySection: { flexDirection: 'column', gap: 3 },
  // 詳細版の techChips（print-primitives.tsx）と同じ折り返し行。分類ラベル列は持たない。
  techChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: PRINT_SIZE.chipGap },
});

/** 簡約表の列見出し（artboard 1d の帯）。列幅と右寄せは 1 行側と同じ値を使う。 */
export function CompactTableHeader() {
  return (
    <View style={styles.headerRow}>
      <PrintText style={styles.headerPeriod}>期間</PrintText>
      <PrintText style={styles.headerMain}>案件 ／ 担当</PrintText>
      <PrintText style={styles.headerTeam}>チーム</PrintText>
    </View>
  );
}

export function ProjectCardCompact({
  project,
  leadingHeader,
  onLeadingHeaderPage,
}: {
  project: PrintProject;
  /**
   * この案件が「区間の先頭」（列ヘッダー直後の 1 件目）のときだけ渡す。
   * 渡された場合、列ヘッダーとこの案件の 1 行目を 1 つの `wrap={false}` 単位に束ねる。
   * これが無いと、実行時点で残り高さが少ないページに列ヘッダーだけが乗り、
   * データ行 0 件のまま改ページする（実測: p19→p20 / p25→p26 境界）。
   * 本文（2 段目）は束ねない — 長文が 1 ページに収まらないとき、@react-pdf は
   * 分割できないブロックを丸ごと次ページへ送るか溢れさせるため、本文は分割可能なままにする。
   */
  leadingHeader?: ReactNode;
  /** leadingHeader が乗ったページ番号を通知する（会社セクション側の「つづき」判定と同じ形）。 */
  onLeadingHeaderPage?: (pageProps: PageRenderProps) => void;
}) {
  const sections = [
    { label: '業務内容', text: project.duties },
    { label: '習得スキル・実績', text: project.acquired },
    { label: 'コメント', text: project.comment },
  ].filter((section) => section.text.length > 0);

  // 詳細版のメタ表（役割・技術領域・担当工程）に対応する情報を、簡約版では表ではなく
  // 1 行の密な文字列にまとめる。「チーム」はチーム列に既に出ているのでここでは重複させない。
  const metaLine = project.metaRows
    .filter((metaRow) => metaRow.label !== 'チーム')
    .map((metaRow) => `${metaRow.label}：${metaRow.value}`)
    .join(' ／ ');
  // 詳細版の技術チップと同じ全件（件数上限は無い）。分類ラベルの列を持たず 1 本にまとめる。
  const techChips = project.techGroups.flatMap((group) => group.chips);
  const hasMetaOrTech = metaLine.length > 0 || techChips.length > 0;

  const row = (
    <View style={styles.row} wrap={false}>
      <PrintText style={styles.period}>{project.compactPeriodText}</PrintText>
      <View style={styles.main}>
        <PrintText style={styles.title}>{project.title}</PrintText>
        {project.compactNote.length > 0 && <PrintText style={styles.note}>{project.compactNote}</PrintText>}
      </View>
      <View style={styles.teamCell}>
        {project.team.length > 0 && <PrintText style={styles.teamText}>{project.team}</PrintText>}
      </View>
    </View>
  );

  return (
    <View style={styles.projectGroup}>
      {leadingHeader ? (
        <View wrap={false} minPresenceAhead={PRINT_SIZE.compactHeaderMinPresenceAhead}>
          {onLeadingHeaderPage && (
            <DynamicView
              render={(pageProps) => {
                if (pageProps.subPageNumber !== undefined) onLeadingHeaderPage(pageProps);
                return null;
              }}
            />
          )}
          {leadingHeader}
          {row}
        </View>
      ) : (
        row
      )}
      {(hasMetaOrTech || sections.length > 0) && (
        <View style={styles.body}>
          {hasMetaOrTech && (
            // 詳細版の techGroup（print-primitives.tsx）と同じ理由で wrap={false} にする。
            // 分割可能なまま改ページを跨ぐと、チップの折り返し行が途中で切れて「文字の無い
            // 枠線チップ」が下端に残る（実測: p20、E社の継続ページで CloudSQL の手前に
            // 空チップ 5 個が出た）。全件を 1 本の行にまとめた分、詳細版の分類単位より
            // 塊が大きくなるが、メタ行 + チップ折り返しは 1 ページ全体の高さに対して
            // 十分小さいため、wrap={false} の「収まらなければ次ページへ」だけで解決する。
            <View style={styles.bodySection}>
              {metaLine.length > 0 && (
                <View wrap={false}>
                  <PrintText style={styles.note}>{metaLine}</PrintText>
                </View>
              )}
              {/* チップは 6 分類ぶんを 1 本にまとめるので件数に上限が無い。全部を 1 つの
                  wrap={false} に入れると、束がページ高を超えたときどのページにも入らず、
                  @react-pdf は改ページの代わりに圧縮・重なり・切り落としを起こす。
                  ページに必ず収まる大きさへ区切り、区切りの中だけ分割禁止にする。 */}
              {chunk(techChips, CHIPS_PER_UNBREAKABLE_GROUP).map((group, gi) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 並び順そのものが単位なので index が識別子になる。
                <View key={`chips-${gi}`} style={styles.techChipsRow} wrap={false}>
                  {group.map((chip, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 分類をまたいで結合しており、同じ技術名が別分類にも重複登録され得る（label だけでは一意にならない）。
                    <Chip key={`${chip.label}-${i}`} chip={chip} />
                  ))}
                </View>
              ))}
            </View>
          )}
          {sections.map((section) => (
            <View key={section.label} style={styles.bodySection}>
              <SectionLabel>{section.label}</SectionLabel>
              <PrintMarkdown text={section.text} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
