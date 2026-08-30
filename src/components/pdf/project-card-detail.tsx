/**
 * 案件カード（詳細版）。デザイン 1c。
 *
 * カード頭は**普通の View**（`fixed` ではない）で描く。以前は `fixed` にしていたが、
 * @react-pdf/layout の `splitNodes`（node_modules/@react-pdf/layout/lib/index.js:2562）は
 * `fixed` な子をページ分割の前後**両方**の断片へ複製するため、ヘッダーを fixed のまま
 * 先頭ブロックが現在ページに収まらないと、現在ページの断片が「ヘッダーだけ」になり
 * 空にならない。ライブラリ側の「中身が全部次ページへ送られるなら親ごと送る」救済
 * （同ファイル 2606 行目、`currentChild.children.length === 0` が条件）はこの状態では
 * 発動せず、ヘッダーだけがそのページに取り残されて次ページに同じ見出しが再度出る
 * 「幽霊ヘッダー」になる（実測: 「業務自動化システムの開発」がこの形で壊れていた）。
 *
 * 対策は 3 つセットでしか効かない:
 *  1. ヘッダーを fixed から外す。
 *  2. ヘッダーと先頭の present ブロックを同じ `wrap={false}` 単位に束ねる。
 *  3. このカード（`styles.card`）を、呼び出し側で別の View に包んで margin を
 *     持たせない。中身の無い（border だけの）ラッパー View を 1 枚挟むだけで、
 *     1・2 をやっても「親ごと次ページへ送る」救済が働かなくなり、束ねた単位の
 *     直後（チップ・本文）が現在ページの同じ位置に圧縮されて重なった
 *     （実測: p8、「モバイル推薦システム開発」）。marginTop はカード自身の
 *     スタイルに持たせる（下記 `styles.card` 参照）。
 * 1・2 をそろえると、束ねた単位が現在ページに収まらない場合はページ断片が丸ごと
 * 空になり、上記の救済が働いて「ヘッダーごと」次ページへ送られる。3 が無いと
 * その救済がラッパー View で止まり、圧縮の壊れ方に戻る。
 *
 * ページ跨ぎの「（続き）」表記はもうこのコンポーネントの責務ではない。カードの外
 * （Page 直下の絶対配置、print-document.tsx）に一本化した — 条件付きレンダーを
 * in-flow ノードに置くと、分割中パスで高さ 0・確定パスで本来の高さという矛盾した
 * 状態になり、ページ割り自体を狂わせるため（絶対配置ならページ全体のレイアウトに
 * 高さとして寄与しない）。ここでは「開始ページ」「終了ページ」を `spanTracker` に
 * 記録するだけで、表示の判断は一切しない。
 *
 * 下罫線は「実際に出したブロックのうち最後のもの」だけ落とす。空フィールドはブロックごと
 * 出さない仕様なので、位置で決め打ちすると宙に浮いた罫線がカード下端に二重で出る。
 */

import { StyleSheet, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { PrintMarkdown } from './print-markdown';
import {
  type createSpanTracker,
  DynamicView,
  MetaTable,
  PrintText,
  SectionLabel,
  TechChipGroups,
} from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintProject } from './print-view-model';

/** ヘッダー単独で置くときに、その下へ最低限確保する高さ（pt）。見出しだけが下端に残るのを防ぐ。 */
const HEADER_MIN_PRESENCE_AHEAD = 80;

const styles = StyleSheet.create({
  // marginTop はここに直接持たせる（呼び出し側でカードを別の View に包んで margin を
  // 付けない）。中身の無い（borderのみの）ラッパー View を 1 枚挟むだけで、ヘッダー＋
  // 先頭ブロックが現在ページに収まらないときに「親ごと次ページへ送る」救済が働かなくなり、
  // 技術チップ・本文が同じ位置に潰れて重なった（実測: p8、「モバイル推薦システム開発」）。
  // ファイル冒頭のコメント参照。
  card: {
    marginTop: PRINT_SIZE.cardGap,
    borderWidth: PRINT_SIZE.ruleThin,
    borderColor: PRINT_COLOR.rule,
    borderRadius: PRINT_SIZE.cardRadius,
    flexDirection: 'column',
  },
  // ブロック間の仕切り。最後のブロックには付けない（カードの外枠と重なる）。
  blockDivider: { borderBottomWidth: PRINT_SIZE.ruleThin, borderBottomColor: PRINT_COLOR.rule },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: PRINT_COLOR.surface,
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

  block: {
    paddingVertical: PRINT_SIZE.cardPadVertical,
    paddingHorizontal: PRINT_SIZE.cardPadHorizontal,
  },
  section: { flexDirection: 'column', gap: 4 },
  sectionSurface: { backgroundColor: PRINT_COLOR.surface },
});

/** 下罫線の判定・開始終了マーカーの位置決めに使うブロック識別子。ヘッダーは常に出るので数えない。 */
type BlockKey = 'meta' | 'tech' | 'duties' | 'acquired' | 'comment';

export function ProjectCardDetail({
  project,
  spanTracker,
}: {
  project: PrintProject;
  /** カードの開始・終了ページを記録する器。ページ直下の継続見出しがこれを読む。 */
  spanTracker: ReturnType<typeof createSpanTracker>;
}) {
  // 会社名と区分の結合はビューモデル側で済んでいる（実データは名前に区分を含むため、
  // ここで機械的に足すと「Q 社（自社サービス事業会社）（自社サービス事業会社）」になる）。
  const companyLine = project.companyLabel;

  const present: BlockKey[] = [];
  if (project.metaRows.length > 0) present.push('meta');
  if (project.techGroups.length > 0) present.push('tech');
  if (project.duties) present.push('duties');
  if (project.acquired) present.push('acquired');
  if (project.comment) present.push('comment');
  const last = present[present.length - 1];
  const divider = (key: BlockKey) => (key === last ? {} : styles.blockDivider);

  // 開始マーカーは先頭の present ブロック、終了マーカーは末尾の present ブロックに置く
  // （1 ブロックしかないカードでは同じブロックが両方を兼ねる）。マーカー自身は
  // 確定パスかどうかの判定を spanTracker 側に委ねる（呼ぶだけでよい）。
  const markStart = (key: BlockKey) =>
    key === present[0] ? (
      <DynamicView
        render={(pageProps) => {
          spanTracker.markStart(project.id, project.title, pageProps);
          return null;
        }}
      />
    ) : null;
  const markEnd = (key: BlockKey) =>
    key === last ? (
      <DynamicView
        render={(pageProps) => {
          spanTracker.markEnd(project.id, pageProps);
          return null;
        }}
      />
    ) : null;

  const header = (
    <View style={present.length > 0 ? [styles.header, styles.blockDivider] : styles.header}>
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

  const blocks: Partial<Record<BlockKey, ReactNode>> = {
    meta: present.includes('meta') && (
      <View key="meta" style={divider('meta')} wrap={false}>
        {markStart('meta')}
        <MetaTable rows={project.metaRows} />
        {markEnd('meta')}
      </View>
    ),
    tech: present.includes('tech') && (
      <View key="tech" style={[styles.block, divider('tech')]}>
        {markStart('tech')}
        <TechChipGroups groups={project.techGroups} />
        {markEnd('tech')}
      </View>
    ),
    // 本文ブロックは「余白の外側」と「gap を持つ内側」に分けている。マーカー（高さ 0）を
    // gap 付きの列に直接入れると gap 4pt ぶん本文が下にずれるため、外側に置く。
    duties: present.includes('duties') && (
      <View key="duties" style={[styles.block, divider('duties')]}>
        {markStart('duties')}
        <View style={styles.section}>
          <SectionLabel>業務内容</SectionLabel>
          <PrintMarkdown text={project.duties} />
        </View>
        {markEnd('duties')}
      </View>
    ),
    acquired: present.includes('acquired') && (
      <View key="acquired" style={[styles.block, styles.sectionSurface, divider('acquired')]}>
        {markStart('acquired')}
        <View style={styles.section}>
          <SectionLabel>習得スキル・実績</SectionLabel>
          <PrintMarkdown text={project.acquired} />
        </View>
        {markEnd('acquired')}
      </View>
    ),
    comment: present.includes('comment') && (
      <View key="comment" style={styles.block}>
        {markStart('comment')}
        <View style={styles.section}>
          <SectionLabel>コメント</SectionLabel>
          <PrintMarkdown text={project.comment} />
        </View>
        {markEnd('comment')}
      </View>
    ),
  };

  const orderedBlocks = present.map((key) => blocks[key]);
  const [firstBlock, ...restBlocks] = orderedBlocks;

  return (
    // 1 ページに収まると見積れるカードは wrap={false} で丸ごと分割禁止にする。
    // @react-pdf は wrap={false} の中身が現在位置に収まらなければページ送りするので、
    // これだけで「案件が改ページで途切れる」を防げる（実測、company-grouping 作業）。
    // 見積りで 1 ページを超えるカード（`fitsOnePage === false`）だけ既定の分割可能な
    // 形（メタ表・チップ分類・本文ブロックの区切りでのみ割れる）のまま描画する。
    <View style={styles.card} wrap={!project.fitsOnePage}>
      {/* ヘッダーと先頭ブロックを 1 つの分割単位にする（ファイル冒頭コメント参照）。
          ただし 1 ページに収まらないカードでは束ねない。先頭ブロックが 1 ページより高い
          （長い業務内容・大きな技術セクション）と、その塊はどのページにも入らず、
          @react-pdf は改ページの代わりに圧縮・重なり・切り落としを起こす。
          その場合はヘッダーだけを分割禁止にし、後続の余白を要求して孤立を防ぐ。 */}
      {project.fitsOnePage ? (
        <View wrap={false}>
          {header}
          {firstBlock}
        </View>
      ) : (
        <>
          <View wrap={false} minPresenceAhead={HEADER_MIN_PRESENCE_AHEAD}>
            {header}
          </View>
          {firstBlock}
        </>
      )}
      {restBlocks}
    </View>
  );
}
