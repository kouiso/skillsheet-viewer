/**
 * 案件カード（詳細版）。デザイン 1c。
 *
 * カードは measure-then-place の葉に分解して置く（print-leaves.tsx）。ここにあるのは
 * ヘッダーの描画と、各ブロックの余白・仕切りの値だけで、ページ割りに関わる指定は持たない。
 *
 * かつてはこのファイルが `wrap={false}` / `minPresenceAhead` / 開始・終了マーカー
 * （`render` prop）を組み合わせて @react-pdf の自動改ページを制御しようとしていた。
 * 「幽霊ヘッダー」「ヘッダー + 先頭ブロックの束ね」「コメント前の無条件改ページ」は
 * どれもその作りへの対症療法で、本文の長さが閾値をまたぐと別の場所で再発した。
 * 割り付けを自前にしたので全部要らない。
 *
 * 下罫線は「実際に出したブロックのうち最後のもの」だけ落とす。空フィールドはブロックごと
 * 出さない仕様なので、位置で決め打ちすると宙に浮いた罫線がカード下端に二重で出る。
 */

import { StyleSheet, View } from '@react-pdf/renderer';

import { PrintText } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintProject } from './print-view-model';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: { flexDirection: 'column', gap: 3, flex: 1 },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  title: { ...PRINT_TYPE.projectTitle, color: PRINT_COLOR.heading },
  company: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label },
  periodBadge: {
    ...PRINT_TYPE.meta,
    fontWeight: PRINT_WEIGHT.bold,
    color: PRINT_COLOR.paper,
    backgroundColor: PRINT_COLOR.accent,
    borderRadius: PRINT_SIZE.chipRadius,
    paddingVertical: PRINT_SIZE.chipPadVertical,
    // 期間は帯の中で左右に余白が要るので、チップ共通の 6pt ではなくデザイン通りの 7pt。
    paddingHorizontal: 7,
  },
  duration: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label },
});

/** ヘッダーの余白（カード枠側の padding として葉に渡す）。 */
export const DETAIL_HEADER_PAD = { vertical: 10, horizontal: 12 } as const;

/** カードヘッダー（通し番号 + 案件名 / 会社名 / 期間バッジ / 期間の長さ）。 */
export function ProjectCardHeader({ project }: { project: PrintProject }) {
  // 会社名と区分の結合はビューモデル側で済んでいる（実データは名前に区分を含むため、
  // ここで機械的に足すと「Q 社（自社サービス事業会社）（自社サービス事業会社）」になる）。
  const companyLine = project.companyLabel;
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {/* 通し番号は書類全体で連番（採番は print-view-model.ts の 1 箇所）。
            案件名と同じ Text に入れて、名前が折り返しても番号だけが宙に浮かないようにする。 */}
        <PrintText style={styles.title}>{`${project.index}. ${project.title}`}</PrintText>
        {companyLine ? <PrintText style={styles.company}>{companyLine}</PrintText> : null}
      </View>
      <View style={styles.headerRight}>
        {project.periodText ? <PrintText style={styles.periodBadge}>{project.periodText}</PrintText> : null}
        {project.durationText ? <PrintText style={styles.duration}>{project.durationText}</PrintText> : null}
      </View>
    </View>
  );
}
