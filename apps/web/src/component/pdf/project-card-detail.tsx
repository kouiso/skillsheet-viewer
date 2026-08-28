/**
 * 案件カード（詳細版）。デザイン 1c。
 *
 * カード頭は `DynamicView fixed` で描く。**カード内の `fixed` はそのカードが占める全ページに
 * 出る**（`react-pdf-capability.node.test.tsx` の F）ので、これ 1 つが初出ヘッダーと継続
 * ヘッダーの両方を兼ねる。ページを跨いだ 2 枚目以降に「何の案件か分からないページ」を
 * 作らないための唯一の仕掛けで、通常の View に戻すと静かに壊れる。
 *
 * ただし「（続き）」を出すかの判定はヘッダーから記録してはいけない（下の `markFirstContent`
 * のコメント参照）。fixed はカードの中身が 1pt も乗らないページにも出るため、実質 1 ページ目が
 * 「（続き）」になる。
 *
 * 下罫線は「実際に出したブロックのうち最後のもの」だけ落とす。空フィールドはブロックごと
 * 出さない仕様なので、位置で決め打ちすると宙に浮いた罫線がカード下端に二重で出る。
 */

import { StyleSheet, View } from '@react-pdf/renderer';

import { PrintMarkdown } from './print-markdown';
import {
  type createFirstPageTracker,
  DynamicView,
  MetaTable,
  type PageRenderProps,
  PrintText,
  SectionLabel,
  TechChipGroups,
} from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintProject } from './print-view-model';

const styles = StyleSheet.create({
  card: {
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

/** 下罫線の判定に使うブロック識別子。ヘッダーは常に出るので数えない。 */
type BlockKey = 'meta' | 'tech' | 'duties' | 'acquired' | 'comment';

export function ProjectCardDetail({
  project,
  tracker,
}: {
  project: PrintProject;
  tracker: ReturnType<typeof createFirstPageTracker>;
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

  /**
   * 「（続き）」を出すかの判定は、**本文が最初に乗ったページ**を基準にする。
   *
   * ヘッダー自身に開始ページを記録させてはいけない。@react-pdf は分割時に `fixed` な子を
   * 前後両ページへ複製する（`splitNodes`）ため、`currentChild.children` が空にならず、
   * ライブラリ側の「中身が全部次ページなら親も送る」救済が効かない。結果、カードの中身が
   * 1pt も乗らないページにも高さ 0〜数 pt の断片が残り、そこでヘッダーの render が動く。
   * ヘッダーが記録すると、そのページが開始ページとして残り、**実際に中身が出る最初の
   * ページが「（続き）」になる**（実測: A4・カードがページ下端付近から始まるとき）。
   *
   * そこで記録は先頭ブロックに置いた marker だけが行う。marker は中身と一緒に動くので、
   * 「中身が出たページ」しか記録しない。ヘッダーは読むだけ。
   */
  let firstContentPage: number | undefined;
  const markFirstContent = (key: BlockKey) =>
    key === present[0] ? (
      <DynamicView
        render={(pageProps) => {
          // 分割中の呼び出しは subPageNumber を持たず、まだそのページに無い節にも来る。
          if (pageProps.subPageNumber === undefined) return null;
          // 共有トラッカーの記録もここで更新する（記録の正本は 1 箇所に保つ）。
          tracker.isContinuation(project.id, pageProps);
          if (firstContentPage === undefined || pageProps.pageNumber < firstContentPage) {
            firstContentPage = pageProps.pageNumber;
          }
          return null;
        }}
      />
    ) : null;
  const isContinuation = (pageProps: PageRenderProps) =>
    firstContentPage !== undefined && pageProps.pageNumber > firstContentPage;

  return (
    <View style={styles.card}>
      <DynamicView
        fixed
        // ヘッダーの下罫線も「後ろにブロックがあるときだけ」。全ブロックが空のカードでは
        // ヘッダーがカード最下段になり、外枠の下辺と 0.75pt の線が二重に出る。
        style={present.length > 0 ? [styles.header, styles.blockDivider] : styles.header}
        render={(pageProps) => (
          <>
            <View style={styles.headerLeft}>
              <PrintText style={styles.title}>
                {isContinuation(pageProps) ? `${project.title}（続き）` : project.title}
              </PrintText>
              {companyLine ? <PrintText style={styles.company}>{companyLine}</PrintText> : null}
            </View>
            <View style={styles.headerRight}>
              {project.periodText ? <PrintText style={styles.periodBadge}>{project.periodText}</PrintText> : null}
              {project.durationText ? <PrintText style={styles.duration}>{project.durationText}</PrintText> : null}
            </View>
          </>
        )}
      />

      {/*
        メタ表は分割禁止。2 列の表が改ページで割れると罫線だけが残った半端な行が出るうえ、
        高さ数 pt の断片がページ末尾に残って marker が「中身が出ていないページ」を
        開始ページとして記録してしまう（実測）。最大 4 行・60pt 程度なので必ず 1 ページに入る。
      */}
      {present.includes('meta') && (
        <View style={divider('meta')} wrap={false}>
          {markFirstContent('meta')}
          <MetaTable rows={project.metaRows} />
        </View>
      )}

      {present.includes('tech') && (
        <View style={[styles.block, divider('tech')]}>
          {markFirstContent('tech')}
          <TechChipGroups groups={project.techGroups} />
        </View>
      )}

      {/*
        本文ブロックは「余白の外側」と「gap を持つ内側」に分けている。marker（高さ 0）を
        gap 付きの列に直接入れると gap 4pt ぶん本文が下にずれるため、外側に置く。
      */}
      {present.includes('duties') && (
        <View style={[styles.block, divider('duties')]}>
          {markFirstContent('duties')}
          <View style={styles.section}>
            <SectionLabel>業務内容</SectionLabel>
            <PrintMarkdown text={project.duties} />
          </View>
        </View>
      )}

      {present.includes('acquired') && (
        <View style={[styles.block, styles.sectionSurface, divider('acquired')]}>
          {markFirstContent('acquired')}
          <View style={styles.section}>
            <SectionLabel>習得スキル・実績</SectionLabel>
            <PrintMarkdown text={project.acquired} />
          </View>
        </View>
      )}

      {present.includes('comment') && (
        <View style={styles.block}>
          {markFirstContent('comment')}
          <View style={styles.section}>
            <SectionLabel>コメント</SectionLabel>
            <PrintMarkdown text={project.comment} />
          </View>
        </View>
      )}
    </View>
  );
}
