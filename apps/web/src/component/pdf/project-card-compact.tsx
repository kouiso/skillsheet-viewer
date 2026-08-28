/**
 * 簡約版の案件カード（デザイン artboard 1d「D — 案件カード（簡約版）」）。
 *
 * デザインは 1 案件 = 1 行に畳んでいるが、**本文（業務内容 / 習得スキル・実績 / コメント）を
 * PDF から落とすことは提出書類として許されない**（本人の要件）。そのため 2 段構成にしている。
 *
 *  - 1 段目: デザインどおりの 1 行（期間 88pt ／ 案件名 + 技術・一言 ／ チーム 44pt）。
 *    ここだけ `wrap={false}` にして、1 行が改ページで割れないようにする。
 *  - 2 段目: 期間列の幅ぶんインデントして案件名の真下に本文を流す。
 *    こちらは `wrap={false}` を付けない。長文が 1 ページに収まらないとき、
 *    @react-pdf は分割できないブロックを丸ごと次ページへ送るか溢れさせるため、
 *    本文は必ず分割可能にしておく必要がある。
 */

import { StyleSheet, View } from '@react-pdf/renderer';

import { PrintMarkdown } from './print-markdown';
import { PrintText, SectionLabel } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintProject } from './print-view-model';

// artboard 1d の簡約表だけが持つ余白。共通トークンの metaRow 系（縦 5 / 横 12）とは別値なので、
// 流用せずここに実数で置く。横 10pt はチーム列 44pt を右端に寄せる前提で決まっている。
const ROW_PAD_VERTICAL = 7;
const ROW_PAD_HORIZONTAL = 10;
const HEAD_PAD_VERTICAL = 5;

/** 案件名と技術・一言の行間（デザインの gap:2px）。 */
const MAIN_COLUMN_GAP = 2;

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

export function ProjectCardCompact({ project }: { project: PrintProject }) {
  // 技術と一言はどちらか片方だけのこともある。空の側で区切り記号が浮かないよう先に落とす。
  const summaryLine = [project.compactTech, project.compactNote].filter(Boolean).join(' ／ ');
  const sections = [
    { label: '業務内容', text: project.duties },
    { label: '習得スキル・実績', text: project.acquired },
    { label: 'コメント', text: project.comment },
  ].filter((section) => section.text.length > 0);

  return (
    <View style={styles.projectGroup}>
      <View style={styles.row} wrap={false}>
        <PrintText style={styles.period}>{project.compactPeriodText}</PrintText>
        <View style={styles.main}>
          <PrintText style={styles.title}>{project.title}</PrintText>
          {summaryLine.length > 0 && <PrintText style={styles.note}>{summaryLine}</PrintText>}
        </View>
        <View style={styles.teamCell}>
          {project.team.length > 0 && <PrintText style={styles.teamText}>{project.team}</PrintText>}
        </View>
      </View>
      {sections.length > 0 && (
        <View style={styles.body}>
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
