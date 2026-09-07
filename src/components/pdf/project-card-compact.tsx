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
 *  - 2 段目: 期間列の幅ぶんインデントして案件名の真下に本文を流す。メタ情報（役割・
 *    技術領域・担当工程）は表ではなく 1 行の密な文字列に、技術チップは詳細版のような
 *    分類ラベル列を持たず 1 本の折り返し行にまとめる（分類は付加情報、技術名そのものが
 *    本体という判断）。件数の上限は無い — 全件をチップに入れる。
 *
 * 1 段目と 2 段目の各ブロックはそれぞれ measure-then-place の葉になる（print-leaves.tsx）。
 * 列ヘッダーだけの改ページ・チップ束の圧縮・「親の最初の子」の誤判定といった、
 * @react-pdf の自動改ページ由来の壊れ方は割り付けを自前にした時点で無くなった。
 */

import { StyleSheet, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

import { type MarkdownPiece, markdownPieces } from './print-markdown';
import { Chip, PrintText, SectionLabel } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintProject } from './print-view-model';

// artboard 1d の簡約表だけが持つ余白。共通トークンの metaRow 系（縦 5 / 横 12）とは別値なので、
// 流用せずここに実数で置く。横 10pt はチーム列 44pt を右端に寄せる前提で決まっている。
const ROW_PAD_VERTICAL = 7;
const ROW_PAD_HORIZONTAL = 10;
const HEAD_PAD_VERTICAL = 5;

/** 案件名と技術・一言の行間（デザインの gap:2px）。 */
const MAIN_COLUMN_GAP = 2;

/** 1 つの葉に入れるチップの上限。11pt のチップが 3 段折り返しても 1 ページに十分収まる件数。 */
const CHIPS_PER_LEAF = 18;

/** 案件まるごとの下端に置く罫線の上の余白（2 段目の最後のブロックとの間隔）。 */
export const COMPACT_GROUP_PAD_BOTTOM = 8;

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

  /** 2 段目の 1 ブロック。期間列の幅 + 行の左余白ぶん下げて、案件名の左端に本文の左端を合わせる。 */
  bodyItem: {
    marginTop: 7,
    paddingLeft: ROW_PAD_HORIZONTAL + PRINT_SIZE.labelColCompact,
    paddingRight: ROW_PAD_HORIZONTAL,
  },
  /** 小見出しの下に続く本文（見出しとの間隔 3pt は bodySection の gap と同じ）。 */
  bodyFollow: {
    marginTop: 3,
    paddingLeft: ROW_PAD_HORIZONTAL + PRINT_SIZE.labelColCompact,
    paddingRight: ROW_PAD_HORIZONTAL,
  },
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

/** 1 段目: デザインどおりの 1 行。 */
export function CompactRow({ project }: { project: PrintProject }) {
  return (
    <View style={styles.row}>
      <PrintText style={styles.period}>{project.compactPeriodText}</PrintText>
      <View style={styles.main}>
        {/* 詳細版と同じ通し番号。両方に出さないと、詳細版と簡約版が混ざる会社で番号が飛ぶ。 */}
        <PrintText style={styles.title}>{`${project.index}. ${project.title}`}</PrintText>
        {project.compactNote.length > 0 && <PrintText style={styles.note}>{project.compactNote}</PrintText>}
      </View>
      <View style={styles.teamCell}>
        {project.team.length > 0 && <PrintText style={styles.teamText}>{project.team}</PrintText>}
      </View>
    </View>
  );
}

export interface CompactBodyPiece {
  el: ReactElement;
  kind: 'meta' | 'chips' | 'label' | MarkdownPiece['kind'];
  text?: string;
  remake?: (text: string) => ReactElement;
  /** 小見出しは直後の本文と同じページに置く。 */
  keepWithNext: boolean;
}

/** 2 段目のブロック列。メタ行 → チップ → 小見出し + 本文、の順。 */
export function compactBodyPieces(project: PrintProject): CompactBodyPiece[] {
  const pieces: CompactBodyPiece[] = [];

  // 詳細版のメタ表（役割・技術領域・担当工程）に対応する情報を、簡約版では表ではなく
  // 1 行の密な文字列にまとめる。「チーム」はチーム列に既に出ているのでここでは重複させない。
  // 期間の長さ（15 ヶ月 等）は画面の案件カードには出ているのに、簡約版の期間列は
  // 短縮した年月しか出せない。ここへ入れて落とさない。
  const metaLine = [
    ...(project.durationText ? [`期間：${project.durationText}`] : []),
    ...project.metaRows
      .filter((metaRow) => metaRow.label !== 'チーム')
      .map((metaRow) => `${metaRow.label}：${metaRow.value}`),
  ].join(' ／ ');
  if (metaLine.length > 0) {
    pieces.push({
      kind: 'meta',
      keepWithNext: false,
      el: (
        <View style={styles.bodyItem}>
          <PrintText style={styles.note}>{metaLine}</PrintText>
        </View>
      ),
    });
  }

  // 詳細版の技術チップと同じ全件（件数上限は無い）。分類ラベルの列を持たず 1 本にまとめる。
  const techChips = project.techGroups.flatMap((group) => group.chips);
  chunk(techChips, CHIPS_PER_LEAF).forEach((group, gi) => {
    pieces.push({
      kind: 'chips',
      keepWithNext: false,
      el: (
        // biome-ignore lint/suspicious/noArrayIndexKey: チップの束は並び順そのものが単位で、安定 id を持たない
        <View key={`chips-${gi}`} style={[styles.bodyItem, styles.techChipsRow]}>
          {group.map((chip, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 分類をまたいで結合しており、同じ技術名が別分類にも重複登録され得る（label だけでは一意にならない）。
            <Chip key={`${chip.label}-${i}`} chip={chip} />
          ))}
        </View>
      ),
    });
  });

  const sections = [
    { label: '業務内容', text: project.duties },
    { label: '習得スキル・実績', text: project.acquired },
    { label: 'コメント', text: project.comment },
  ].filter((section) => section.text.length > 0);
  for (const section of sections) {
    pieces.push({
      kind: 'label',
      keepWithNext: true,
      el: (
        <View style={styles.bodyItem}>
          <SectionLabel>{section.label}</SectionLabel>
        </View>
      ),
    });
    for (const piece of markdownPieces(section.text)) {
      const wrap = (el: ReactElement) => (
        <View
          style={[
            styles.bodyFollow,
            piece.indent > 0 ? { paddingLeft: styles.bodyFollow.paddingLeft + piece.indent } : {},
          ]}
        >
          {el}
        </View>
      );
      const remake = piece.remake;
      pieces.push({
        kind: piece.kind,
        keepWithNext: piece.keepWithNext ?? false,
        el: wrap(piece.el),
        ...(piece.text !== undefined && remake
          ? { text: piece.text, remake: (text: string) => wrap(remake(text)) }
          : {}),
      });
    }
  }
  return pieces;
}
