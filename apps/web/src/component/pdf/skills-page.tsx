/**
 * スキル一覧ページ（デザイン artboard 1g の p2）。
 *
 * 現行 PDF は「1 スキル 1 行」の表で同じ内容に 4 ページ使っている。ここはチップ形式に
 * 畳んで 1 ページに収める。分類ラベル 1 列 + 折り返すチップ列という形は、
 * 「言語ごとの経験年数」という本人が明示的に残したい情報を落とさずに密度だけ上げられる。
 *
 * ページ分割を禁止する `wrap={false}` は使わない。@react-pdf/renderer 4.5.1 では
 * ページ途中から始まる分割不可ブロックが丸ごと消えることがある（skill-sheet-document.tsx
 * の CARD_MAX_ROWS のコメント / #172）。1 ページに収まる前提の版面なので、
 * 万一溢れたときに欠落するより折り返して続く方が安全側。
 */

import { StyleSheet, View } from '@react-pdf/renderer';

import { Chip, PrintText } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE } from './print-tokens';
import type { PrintChip, PrintMetaRow, PrintSkill, PrintSkillGroup } from './print-view-model';
import { chipEmphasis } from './print-view-model';

/**
 * 分類ラベル列の幅。技術チップの分類ラベル列（`PRINT_SIZE.labelColTech` = 80pt）に揃える。
 * デザインは 74pt だが、実データの分類名 `フロントエンド`（11pt × 7 文字 = 77pt）が
 * 74pt では 2 行に折り返す（実測）。縦のラインを増やさないためにも 80pt に合わせる。
 */
const CATEGORY_COL_WIDTH = PRINT_SIZE.labelColTech;

/** このページのチップ間隔だけデザインは 4pt（カード内の 3pt より広い。1 ページ全面に並ぶため）。 */
const SKILL_CHIP_GAP = 4;

const styles = StyleSheet.create({
  heading: {
    ...PRINT_TYPE.company,
    color: PRINT_COLOR.heading,
    paddingTop: 14,
    paddingBottom: 4,
    borderBottomWidth: PRINT_SIZE.ruleStrong,
    borderBottomColor: PRINT_COLOR.heading,
  },
  legend: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.label,
    lineHeight: 1.6,
    paddingTop: 8,
    paddingBottom: 12,
  },
  groups: { flexDirection: 'column', gap: 11 },

  expertise: { flexDirection: 'column', gap: 2, paddingTop: 8, paddingBottom: 4 },
  expertiseRow: { flexDirection: 'row', gap: 8 },
  // ラベル幅は技術チップの分類ラベルと同じ列に揃える（縦のラインを増やさない）。
  expertiseLabel: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label, width: PRINT_SIZE.labelColTech, flexShrink: 0 },
  expertiseValue: { ...PRINT_TYPE.meta, color: PRINT_COLOR.text, flex: 1 },
  group: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  category: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.label,
    width: CATEGORY_COL_WIDTH,
    flexShrink: 0,
    // チップは上下 2pt のパディングと枠線を持つため、ラベルの 1 行目と視覚的な高さを揃える。
    paddingTop: 3,
  },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: SKILL_CHIP_GAP },
});

const LEGEND = '塗り = 上級 ／ 枠線 = 中級・初級。カッコ内は経験年数。';

function toChip(skill: PrintSkill): PrintChip {
  return {
    // 年数を出すかどうかは skillYearsLabel（print-view-model.ts）が既に判定済み
    // （分類許可リスト + スキルビュートグル）。ここでは組み立てるだけ。
    label: skill.yearsLabel ? `${skill.name}（${skill.yearsLabel}）` : skill.name,
    emphasis: chipEmphasis(skill.level),
  };
}

export function SkillsPage({ groups, expertiseRows }: { groups: PrintSkillGroup[]; expertiseRows: PrintMetaRow[] }) {
  const filled = groups.filter((group) => group.skills.length > 0);
  return (
    <>
      <PrintText style={styles.heading}>スキル一覧</PrintText>
      {/* 得意分野・得意業務。1 ページ目のプロフィール帯は 1 行 3 列で、この 2 項目は
          長すぎて帯の高さを倍にしてしまう。内容もスキルの要約なのでここに置く。 */}
      {expertiseRows.length > 0 && (
        <View style={styles.expertise}>
          {expertiseRows.map((row) => (
            <View key={row.label} style={styles.expertiseRow}>
              <PrintText style={styles.expertiseLabel}>{row.label}</PrintText>
              <PrintText style={styles.expertiseValue}>{row.value}</PrintText>
            </View>
          ))}
        </View>
      )}
      {filled.length > 0 && (
        <>
          <PrintText style={styles.legend}>{LEGEND}</PrintText>
          <View style={styles.groups}>
            {filled.map((group, groupIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 分類名はブロックごとの自由入力で、未入力（空文字）や重複があり得るので index を混ぜる
              <View key={`${group.category}-${groupIndex}`} style={styles.group}>
                <PrintText style={styles.category}>{group.category}</PrintText>
                <View style={styles.chips}>
                  {group.skills.map((skill, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 同一分類に同名スキルが重複する実データがあり得るため index を混ぜる（並び替えも状態も無い静的な列）
                    <Chip key={`${skill.name}-${index}`} chip={toChip(skill)} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );
}
