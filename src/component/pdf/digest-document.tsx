/**
 * 要約版（digest）PDF の組み立て。全文版（print-document.tsx）とは別の Document に
 * 分ける — 「全文版の出力を 1 バイトも変えない」要件を差分の有無で示せるようにするため。
 *
 * 構成:
 * - 1 ページ目: 全文版と同じ SummaryPage。違いはタイトルの「（要約版）」だけ。
 * - 2 ページ目以降: 会社ごとの見出し帯（社名・業種・期間・案件数）と案件行
 *   （期間・通し番号付き案件名・チーム）だけの一覧。本文や説明文は載せない。
 *
 * ページ割りは全文版と同じ measure-then-place（print-measure → print-paginate →
 * print-page）を通る。wrap / minPresenceAhead / render prop の自動改ページには頼らない。
 */
import { Document, type DocumentProps, Font, Page, StyleSheet, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { Block } from '@/db/block';
import { digestTitle } from '@/lib/export/edition';
import { PROJECT_CONTENT_HEIGHT } from './print-document';
import type { Leaf, MeasuredLeaf } from './print-leaf';
import { frameLeaf, NO_FRAME } from './print-leaf-frame';
import { continuationHeadingFor, splitLeaf } from './print-leaf-list';
import { measureLeaf, measureLeaves } from './print-measure';
import { ContinuationHeading, continuationStyles } from './print-page';
import { type PaginateOptions, type PrintPage, paginate } from './print-paginate';
import { DynamicView, PrintText, printStyles, RunningFooter } from './print-primitive';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-token';
import { buildPrintViewModel, type PrintCompany, type PrintProject, type PrintViewModel } from './print-view-model';
import { SummaryPage } from './summary-page';

// ── 会社一覧の部品 ─────────────────────────────────────────────────────────

/** 列ヘッダー。全文版の CompactTableHeader と同じ見た目で、文言だけ「案件」に絞る。 */
function DigestTableHeader() {
  return (
    <View style={digestStyles.headerRow}>
      <PrintText style={digestStyles.headerPeriod}>期間</PrintText>
      <PrintText style={digestStyles.headerMain}>案件</PrintText>
      <PrintText style={digestStyles.headerTeam}>チーム</PrintText>
    </View>
  );
}

/**
 * 会社見出し帯。CompanyHeadingBand の形を写しつつ、右側に期間と案件数を置き、
 * 2 行目（案件数/役割/チーム規模）は出さない。本文の省略はしないので、
 * 長い社名・期間はそのまま折り返して全部出る。
 */
function DigestCompanyHeading({ company }: { company: PrintCompany }) {
  const isLatest = company.isLatest;
  const right = [company.periodText, `${company.projectCount} 案件`].filter(Boolean).join('　');
  return (
    <View style={[digestStyles.band, isLatest ? digestStyles.bandLatest : digestStyles.bandEarlier]}>
      <View style={digestStyles.bandLeft}>
        <PrintText style={isLatest ? digestStyles.nameLatest : digestStyles.nameEarlier}>{company.name}</PrintText>
        {company.kind !== '' && (
          <PrintText style={isLatest ? digestStyles.kindLatest : digestStyles.kindEarlier}>{company.kind}</PrintText>
        )}
      </View>
      {right !== '' && (
        <PrintText style={isLatest ? digestStyles.metaLatest : digestStyles.metaEarlier}>{right}</PrintText>
      )}
    </View>
  );
}

/**
 * 案件行。CompactRow の 1 行の値（期間・案件名・チーム）を写すが、要約列
 * （compactNote）は持たない — 要約版は「見出しだけの一覧」が仕事なので本文を出さない。
 * 下罫線は枠（frame.divider）に頼らず行自身が引く（要約版の葉は NO_FRAME）。
 */
function DigestRow({ project }: { project: PrintProject }) {
  return (
    <View style={digestStyles.row}>
      <PrintText style={digestStyles.rowPeriod}>{project.compactPeriodText}</PrintText>
      <View style={digestStyles.rowMain}>
        <PrintText style={digestStyles.rowTitle}>{`${project.index}. ${project.title}`}</PrintText>
      </View>
      <View style={digestStyles.rowTeamCell}>
        {project.team.length > 0 && <PrintText style={digestStyles.rowTeamText}>{project.team}</PrintText>}
      </View>
    </View>
  );
}

const digestStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    backgroundColor: PRINT_COLOR.surface,
    borderBottomWidth: PRINT_SIZE.ruleThin,
    borderBottomColor: PRINT_COLOR.rule,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  headerPeriod: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.label,
    width: PRINT_SIZE.labelColCompact,
    flexShrink: 0,
  },
  headerMain: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.label,
    flex: 1,
  },
  headerTeam: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.label,
    width: PRINT_SIZE.teamColCompact,
    flexShrink: 0,
    textAlign: 'right',
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 9,
  },
  bandLatest: {
    backgroundColor: PRINT_COLOR.accent,
  },
  bandEarlier: {
    backgroundColor: PRINT_COLOR.band,
    borderTopWidth: PRINT_SIZE.ruleStrong,
    borderTopColor: PRINT_COLOR.heading,
  },
  bandLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 9,
  },
  nameLatest: { ...PRINT_TYPE.meta, fontWeight: PRINT_WEIGHT.bold, color: PRINT_COLOR.paper },
  nameEarlier: { ...PRINT_TYPE.meta, fontWeight: PRINT_WEIGHT.bold, color: PRINT_COLOR.heading },
  kindLatest: { ...PRINT_TYPE.meta, color: PRINT_COLOR.onAccent },
  kindEarlier: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label },
  metaLatest: { ...PRINT_TYPE.meta, fontWeight: PRINT_WEIGHT.bold, color: PRINT_COLOR.paper, flexShrink: 0 },
  metaEarlier: { ...PRINT_TYPE.meta, fontWeight: PRINT_WEIGHT.bold, color: PRINT_COLOR.heading, flexShrink: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: PRINT_SIZE.ruleThin,
    borderBottomColor: PRINT_COLOR.rule,
  },
  rowPeriod: {
    ...PRINT_TYPE.meta,
    fontWeight: PRINT_WEIGHT.bold,
    color: PRINT_COLOR.heading,
    width: PRINT_SIZE.labelColCompact,
    flexShrink: 0,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'column',
  },
  rowTitle: {
    ...PRINT_TYPE.body,
    fontWeight: PRINT_WEIGHT.medium,
    lineHeight: 1.5,
    color: PRINT_COLOR.heading,
  },
  rowTeamCell: {
    width: PRINT_SIZE.teamColCompact,
    flexShrink: 0,
  },
  rowTeamText: {
    ...PRINT_TYPE.meta,
    color: PRINT_COLOR.text,
    textAlign: 'right',
  },
});

// ── 会社一覧の葉とページ割り ────────────────────────────────────────────────

/**
 * 会社一覧の葉列。先頭の列ヘッダーは文書全体で 1 つだけ（leaves[0]）。
 * そのあと「見出し帯 → 案件行」を会社ごとに繰り返す。
 * groupId 'digest' は行どうしを同じ表に属する葉として束ね、続きページ判定に使う。
 */
function digestLeaves(vm: PrintViewModel): Leaf[] {
  const first = vm.companies[0];
  const leaves: Leaf[] = [
    {
      id: 'digest-header',
      kind: 'compact-header',
      companyId: first.id,
      companyLabel: first.name,
      groupId: 'digest',
      el: <DigestTableHeader />,
      keepWithNext: true,
      splittable: 'never',
      frame: NO_FRAME,
    },
  ];
  for (const company of vm.companies) {
    leaves.push({
      id: `digest-company:${company.id}`,
      kind: 'company-heading',
      companyId: company.id,
      companyLabel: company.name,
      el: <DigestCompanyHeading company={company} />,
      keepWithNext: true,
      splittable: 'never',
      frame: { ...NO_FRAME, gapAbove: 6 },
    });
    for (const project of company.projects) {
      leaves.push({
        id: `digest-row:${project.id}`,
        kind: 'compact-row',
        companyId: company.id,
        companyLabel: company.name,
        groupId: 'digest',
        cardId: project.id,
        cardLabel: project.title,
        cardLevel: 'compact',
        el: <DigestRow project={project} />,
        keepWithNext: false,
        splittable: 'never',
        frame: NO_FRAME,
      });
    }
  }
  return leaves;
}

/**
 * 行から始まる続きページの先頭に列ヘッダーの複製を置く。
 * compactContinuationLeaf と同じ判定で、枠だけ NO_FRAME にする。
 * 見出し帯から始まるページには列ヘッダーが入らない（見出し帯に groupId が無いため）。
 */
function digestContinuationLeaf(header: MeasuredLeaf): PaginateOptions['continuation'] {
  return (first, previous) => {
    if (!first.groupId || first.groupId !== previous.groupId) return undefined;
    if (first.kind === 'compact-header') return undefined;
    return { ...header, id: `${header.id}:${first.id}`, groupId: first.groupId, frame: NO_FRAME };
  };
}

/**
 * 表示モデルの会社一覧を葉にして測り、ページに割り付ける。
 * vm.companies が空なら測らずに [] を返す（呼び出し側は buildPrintDigestDocument が先に弾く）。
 */
export async function paginateDigest(vm: PrintViewModel, fontStore: typeof Font = Font): Promise<PrintPage[]> {
  if (vm.companies.length === 0) return [];
  // 測るのは列ヘッダーを含む全部の葉。leaves[0] は列ヘッダーの葉。
  const [header, ...measured] = await measureLeaves(digestLeaves(vm), fontStore);
  const options: PaginateOptions = {
    contentHeight: PROJECT_CONTENT_HEIGHT,
    split: splitLeaf,
    measure: (leaf) => measureLeaf(leaf, fontStore),
    continuation: digestContinuationLeaf(header),
  };
  return paginate([header, ...measured], options);
}

// ── Document ───────────────────────────────────────────────────────────────

export interface PrintDigestDocumentProps {
  /** すでに「（要約版）」を含む表示用タイトル。 */
  title: string;
  vm: PrintViewModel;
  pages: PrintPage[];
}

/**
 * 要約版の Document。1 ページ目は全文版と同じ SummaryPage（続き見出しとフッターも同じ）、
 * 2 ページ目以降は割り付け済みの PrintPage[] を案件ページと同じ形で描く。
 * 違いはタイトルだけ — ここに skills ページや案件詳細カードは来ない。
 */
export function PrintDigestDocument({ title, vm, pages }: PrintDigestDocumentProps) {
  const footer = <RunningFooter name={vm.summary.name} sheetTitle={vm.summary.sheetTitle} />;
  const skillsPageRenders = vm.showSkills && vm.skillGroups.length > 0;
  return (
    <Document title={title}>
      <Page size="A4" style={printStyles.page}>
        {/* 1 ページ目が はみ出たときだけ出す続き見出し。全文版と同じ形で、文字だけ「（続き）」。 */}
        <DynamicView
          fixed
          style={continuationStyles.header}
          render={({ subPageNumber }) =>
            subPageNumber !== undefined && subPageNumber > 1 ? (
              <View style={continuationStyles.inner}>
                <PrintText style={continuationStyles.text}>{`${vm.summary.sheetTitle}（続き）`}</PrintText>
              </View>
            ) : null
          }
        />
        <SummaryPage
          summary={vm.summary}
          showProcess={vm.showProcess}
          fallbackExpertiseRows={skillsPageRenders ? undefined : vm.summary.expertiseRows}
        />
        {footer}
      </Page>
      {pages.map((page, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: ページは順序そのものが identity
        <Page key={index} size="A4" style={printStyles.page}>
          <ContinuationHeading text={continuationHeadingFor(page, index)} />
          {page.leaves.map((placed) => frameLeaf(placed.leaf))}
          {footer}
        </Page>
      ))}
    </Document>
  );
}

/**
 * 要約版 Document を組み立てる公開 API。内部でフォント登録はしない（呼び出し側で登録済み前提）。
 * vm.companies が空（案件ブロック無し / 全件非表示）なら reject する。
 */
export async function buildPrintDigestDocument(
  input: { title: string; blocks: Block[]; referenceMonth?: number },
  fontStore: typeof Font = Font,
): Promise<ReactElement<DocumentProps>> {
  const docTitle = digestTitle(input.title);
  const vm = buildPrintViewModel(docTitle, input.blocks, undefined, input.referenceMonth);
  if (vm.companies.length === 0) {
    throw new Error('digest edition requires at least one visible project');
  }
  const pages = await paginateDigest(vm, fontStore);
  return <PrintDigestDocument title={docTitle} vm={vm} pages={pages} />;
}
