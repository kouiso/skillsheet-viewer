/**
 * 1 ページ目のサマリ（デザイン 1a「A — サマリ（1 ページ目）」）。
 *
 * `<Page>` は呼び出し側が持ち、ここは**中身だけ**を返す。下端のプロフィール帯を
 * 紙の底に寄せるための `flex:1` スペーサーが Page 直下の子である必要があるため、
 * ラッパー View を挟まずフラグメントで返している（Page が縦方向の flex コンテナ）。
 *
 * デザインにある次の 3 つは、ビューモデルに対応するデータが無いので出さない:
 * ポジショニング文 / 直近 3 案件 / マネジメント経験。
 * PDF のためにビューモデルへフィールドを足さない、という方針に従う。
 */

import { StyleSheet, View } from '@react-pdf/renderer';

import { PrintMarkdown } from './print-markdown';
import { BandChip, ChipRow, PrintText, printStyles, SectionLabel } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintMetaRow, PrintSummary } from './print-view-model';

/**
 * 見出し下の 1.5pt 罫線までの余白。デザイン実数は 10pt だったが、1 ページ目の自己紹介が
 * あふれて資格・学歴などのプロフィール帯が 2 ページ目にほぼ単独ではみ出す不具合の修正で、
 * フォントサイズを一切変えずに縦方向の余白だけを詰めて 1 ページに収める判断をした
 * （summary-page.tsx 内のローカル定数だけを対象にし、他ページと共有する PRINT_SIZE / PRINT_TYPE
 * には触れていない）。
 */
const HEADER_PAD_BOTTOM = 7;

/**
 * 氏名列の上限幅。
 *
 * @react-pdf は `flexShrink` を見ない（実測: 指定しても行の子は 1pt も縮まない）。
 * 何も付けないと、氏名も肩書きも自分の内容幅のまま並んで紙幅 595pt を超え、
 * はみ出した文字が黙って切り落とされる（実測 x+width = 600.5pt）。
 * そこで肩書きを `flex:1` で「残り幅の箱 + 右寄せ」にし、氏名列にだけ上限を置く。
 * 通常のデータでは氏名列は内容幅（約 135pt）でこの上限に触らないので、
 * デザイン通り肩書きが 1 行で右端に収まる。
 */
const HEADER_LEFT_MAX_WIDTH = '55%';

/**
 * 数値セルの左右パディング。デザインは 10pt で、カード用の
 * `PRINT_SIZE.cardPadHorizontal`（12pt）とは別の値なのでトークンを流用しない。
 */
const STAT_PAD_HORIZONTAL = 10;

/**
 * 見出しと数値セルの間隔。デザインではここにポジショニング文（`padding:12px 0 14px`）が
 * 入っていた。その文を出さないので、直下の間隔だけを残す。1 ページ目の縦の詰め直し
 * （HEADER_PAD_BOTTOM のコメント参照）で 14pt から詰めている。
 */
const STATS_MARGIN_TOP = 9;

/**
 * セクション間の間隔。デザインは各ブロックが `padding-top:16px`。1 ページ目の縦の詰め直し
 * （HEADER_PAD_BOTTOM のコメント参照）で詰めている。
 */
const SECTION_PAD_TOP = 10;

/** プロフィール帯のラベル列。デザインは 52pt（メタ表の 62pt とは別列）。 */
const PROFILE_LABEL_WIDTH = 52;

/** プロフィール帯は 3 列。3 × 33.33% = 99.99% で 100% を超えず、確実に 3 個ずつ折り返す。 */
const PROFILE_COLUMN_WIDTH = '33.33%';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderBottomWidth: PRINT_SIZE.ruleStrong,
    borderBottomColor: PRINT_COLOR.heading,
    paddingBottom: HEADER_PAD_BOTTOM,
  },
  headerLeft: { flexDirection: 'column', gap: 3, maxWidth: HEADER_LEFT_MAX_WIDTH },
  // letterSpacing は pt で指定する（デザインの 0.12em × 11pt = 1.32pt）。
  kicker: {
    ...PRINT_TYPE.meta,
    fontWeight: PRINT_WEIGHT.medium,
    color: PRINT_COLOR.label,
    letterSpacing: 1.32,
  },
  name: { ...PRINT_TYPE.name, color: PRINT_COLOR.heading },
  // デザイン実数 13pt / 700 / 行間 1.5。projectTitle（1.45）とは行間が違うので直接書く。
  jobTitle: {
    fontSize: 13,
    fontWeight: PRINT_WEIGHT.bold,
    lineHeight: 1.5,
    color: PRINT_COLOR.accent,
    textAlign: 'right',
    // 残り幅いっぱいの箱にして、中で右寄せさせる（HEADER_LEFT_MAX_WIDTH のコメント参照）。
    flex: 1,
  },

  statsRow: {
    flexDirection: 'row',
    marginTop: STATS_MARGIN_TOP,
    borderWidth: PRINT_SIZE.ruleThin,
    borderColor: PRINT_COLOR.rule,
    borderRadius: PRINT_SIZE.cardRadius,
  },
  statCell: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
    paddingVertical: PRINT_SIZE.cardPadVertical,
    paddingHorizontal: STAT_PAD_HORIZONTAL,
  },
  statCellDivider: { borderRightWidth: PRINT_SIZE.ruleThin, borderRightColor: PRINT_COLOR.rule },
  statLabel: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label },
  statValue: { ...PRINT_TYPE.stat, color: PRINT_COLOR.heading },

  // gap は HEADER_PAD_BOTTOM のコメントの詰め直しで 1〜2pt ずつ削っている。
  skillSection: { flexDirection: 'column', gap: 6, paddingTop: SECTION_PAD_TOP },
  prSection: { flexDirection: 'column', gap: 5, paddingTop: SECTION_PAD_TOP },
  processSection: { flexDirection: 'column', gap: 5, paddingTop: SECTION_PAD_TOP },

  // プロフィール帯を紙の下端へ押し下げる。
  spacer: { flex: 1 },

  // 得意分野・得意業務のフォールバック（スキル一覧ページが出ないときだけ 1 ページ目に出す）。
  // プロフィール帯（1 行 3 列 = 1 セル約 110pt）には長すぎて崩れるため、全幅 1 行にする。
  // paddingTop / marginBottom は HEADER_PAD_BOTTOM のコメントの詰め直しで詰めている。
  expertiseSection: {
    flexDirection: 'column',
    gap: 2,
    borderTopWidth: PRINT_SIZE.ruleThin,
    borderTopColor: PRINT_COLOR.rule,
    paddingTop: 7,
    marginBottom: 4,
  },
  expertiseRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },

  // paddingTop は HEADER_PAD_BOTTOM のコメントの詰め直しで詰めている。
  profileBand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: PRINT_SIZE.ruleThin,
    borderTopColor: PRINT_COLOR.rule,
    paddingTop: 7,
  },
  profileCell: { width: PROFILE_COLUMN_WIDTH, flexDirection: 'row', gap: 6, paddingVertical: 2 },
  profileLabel: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label, width: PROFILE_LABEL_WIDTH, flexShrink: 0 },
  // flex:1 を与えて、長い値がセル幅で折り返すようにする（セルからはみ出させない）。
  profileValue: { ...PRINT_TYPE.meta, color: PRINT_COLOR.text, flex: 1 },
});

export function SummaryPage({
  summary,
  showProcess,
  fallbackExpertiseRows,
}: {
  summary: PrintSummary;
  showProcess: boolean;
  /**
   * スキル一覧ページが出ない（ビュートグル OFF、またはスキルブロックが 0 件）ときに
   * 得意分野・得意業務をここへ回す。渡さなければ何も描かない（通常はスキル一覧ページ側の
   * `expertiseRows` が受け皿になる。呼び出し側 `print-document.tsx` がどちらか一方だけ
   * 渡す判断をする）。
   */
  fallbackExpertiseRows?: PrintMetaRow[];
}) {
  const stats = summary.stats;
  const showProcessBlock = showProcess && summary.processLabels.length > 0;

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {summary.sheetTitle ? <PrintText style={styles.kicker}>{summary.sheetTitle}</PrintText> : null}
          {summary.name ? <PrintText style={styles.name}>{summary.name}</PrintText> : null}
        </View>
        {summary.title ? <PrintText style={styles.jobTitle}>{summary.title}</PrintText> : null}
      </View>

      {stats.length > 0 && (
        <View style={styles.statsRow}>
          {stats.map((stat, index) => (
            <View
              key={`${stat.label}-${stat.value}-${stat.unit}`}
              // 区切りは各セルの右罫線で描く。最終セルだけ外枠と二重にならないよう外す。
              style={index < stats.length - 1 ? [styles.statCell, styles.statCellDivider] : styles.statCell}
            >
              <PrintText style={styles.statLabel}>{stat.label}</PrintText>
              <PrintText style={styles.statValue}>{[stat.value, stat.unit].filter(Boolean).join(' ')}</PrintText>
            </View>
          ))}
        </View>
      )}

      {summary.topSkills.length > 0 && (
        <View style={styles.skillSection}>
          <SectionLabel>{summary.skillEmphasisMode === 'featured' ? '主力スタック' : '主力スタック（経験年数）'}</SectionLabel>
          <ChipRow chips={summary.topSkills} />
        </View>
      )}

      {showProcessBlock && (
        <View style={styles.processSection}>
          <SectionLabel>対応可能工程</SectionLabel>
          <View style={printStyles.chipRow}>
            {summary.processLabels.map((label) => (
              <BandChip key={label} label={label} />
            ))}
          </View>
        </View>
      )}

      {/* 得意分野。画面の ProfileIntro は出しているのに PDF からだけ消えていた。
          自己紹介の直前に置く — 短い語の並びなので工程チップと同じ帯で読める。 */}
      {summary.strengths.length > 0 && (
        <View style={styles.processSection}>
          <SectionLabel>得意分野</SectionLabel>
          <View style={printStyles.chipRow}>
            {summary.strengths.map((label) => (
              <BandChip key={label} label={label} />
            ))}
          </View>
        </View>
      )}

      {/* 自己紹介はデザインでは 2 ページ目だが、1 ページ目に置く。デザインが 1 ページ目に
          敷いていた「直近 3 案件」と「ポジショニング文」を出さない判断（前者は指示、後者は
          DB に該当データが無い）で約 490pt の空白が空き、空白のまま出すと「書くことが無い」
          と読まれる。自己紹介は「何屋か」を答える文章そのもので、1 ページ目の役割に合う。 */}
      {summary.pr ? (
        <View style={styles.prSection}>
          <SectionLabel>自己紹介</SectionLabel>
          <PrintMarkdown text={summary.pr} />
        </View>
      ) : null}

      <View style={styles.spacer} />

      {fallbackExpertiseRows && fallbackExpertiseRows.length > 0 && (
        <View style={styles.expertiseSection}>
          {fallbackExpertiseRows.map((row) => (
            <View key={row.label} style={styles.expertiseRow}>
              <PrintText style={styles.profileLabel}>{row.label}</PrintText>
              <PrintText style={styles.profileValue}>{row.value}</PrintText>
            </View>
          ))}
        </View>
      )}

      {summary.profileRows.length > 0 && (
        <View style={styles.profileBand}>
          {summary.profileRows.map((row) => (
            <View key={row.label} style={styles.profileCell}>
              <PrintText style={styles.profileLabel}>{row.label}</PrintText>
              <PrintText style={styles.profileValue}>{row.value}</PrintText>
            </View>
          ))}
        </View>
      )}
    </>
  );
}
