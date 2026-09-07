/**
 * 提出用 PDF の組み立て。デザイン（Skillsheet Redesign）の部品を Page に並べる。
 *
 * 3 層構造にしている。エージェントが最初に読む 1 ページ、企業の PM が読む案件セクション、
 * 経歴の裏付けとして流し見されるスキル一覧、という読まれ方に合わせたもの。
 *
 * 案件セクションは measure-then-place で組む: 会社見出し・カードの各ブロック・段落を葉に
 * 分解し（print-leaves.tsx）、描く前に全部の高さを測り（print-measure.tsx）、自前で
 * ページに割り付け（print-paginate.ts）、明示的な `<Page>` に並べる（print-pages.tsx）。
 * 測定が非同期なので、この文書は `buildPrintSkillSheetDocument` で組み立てる。
 * 1 ページ目とスキル一覧は @react-pdf の自動改ページのまま（崩れの報告が無い）。
 */

import { Document, type DocumentProps, Font, Page, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { Block } from '@/db/blocks';

import { COMPACT_HEADER_TEMPLATE, compactContinuationLeaf, splitLeaf, toLeaves } from './print-leaves';
import { measureLeaf, measureLeaves } from './print-measure';
import { continuationStyles, ProjectPages } from './print-pages';
import { type PaginateOptions, type PrintPage, paginate } from './print-paginate';
import { DynamicView, PrintText, printStyles, RunningFooter } from './print-primitives';
import { PRINT_SIZE } from './print-tokens';
import type { PrintViewKey, PrintViewModel } from './print-view-model';
import { buildPrintViewModel } from './print-view-model';
import { SkillsPage } from './skills-page';
import { SummaryPage } from './summary-page';

/** 本文の高さ = ページ高 − 上余白 − （下余白 + フッター余白）。printStyles.page と同じ値。 */
export const PROJECT_CONTENT_HEIGHT = PRINT_SIZE.pageHeight - PRINT_SIZE.padTop - (PRINT_SIZE.padBottom + 14);

export interface PrintSkillSheetDocumentInput {
  title: string;
  blocks: Block[];
  /** 画面のビュートグルの状態。未指定は全 ON（画面側 isViewOn と同じ既定）。 */
  views?: PrintViewKey[];
  /** 継続中案件の経験月数に使う固定月キー。 */
  referenceMonth?: number;
}

export interface PrintSkillSheetDocumentProps {
  title: string;
  vm: PrintViewModel;
  /** 割り付け済みの案件セクション。案件を出さないときは空配列。 */
  projectPages: PrintPage[];
}

/**
 * 案件セクションを葉に分解して測り、ページに割り付ける。
 * `fontStore` は測定に使う（ブラウザでは renderer の `Font`、テストでも同じ）。
 */
export async function paginateProjects(vm: PrintViewModel, fontStore: typeof Font = Font): Promise<PrintPage[]> {
  if (!vm.showProjects || vm.companies.length === 0) return [];
  const leaves = toLeaves(vm);
  const [header, ...measured] = await measureLeaves([COMPACT_HEADER_TEMPLATE, ...leaves], fontStore);
  const options: PaginateOptions = {
    contentHeight: PROJECT_CONTENT_HEIGHT,
    split: splitLeaf,
    measure: (leaf) => measureLeaf(leaf, fontStore),
    continuation: compactContinuationLeaf(header),
  };
  return paginate(measured, options);
}

export async function buildPrintSkillSheetDocument(
  input: PrintSkillSheetDocumentInput,
  fontStore: typeof Font = Font,
): Promise<ReactElement<DocumentProps>> {
  const vm = buildPrintViewModel(input.title, input.blocks, input.views, input.referenceMonth);
  const projectPages = await paginateProjects(vm, fontStore);
  return <PrintSkillSheetDocument title={input.title} vm={vm} projectPages={projectPages} />;
}

export function PrintSkillSheetDocument({ title, vm, projectPages }: PrintSkillSheetDocumentProps) {
  const footer = <RunningFooter name={vm.summary.name} sheetTitle={vm.summary.sheetTitle} />;
  // スキル一覧セクション自体が出ない（ビュートグル OFF、またはスキルブロックが 0 件）とき、
  // 得意分野・得意業務（expertiseRows）の行き先が無くなり本文から丸ごと消えていた
  // （実測、レビュー指摘）。その受け皿を 1 ページ目に切り替える。
  const skillsPageRenders = vm.showSkills && vm.skillGroups.length > 0;

  return (
    <Document title={title}>
      <Page size="A4" style={printStyles.page}>
        {/* 1 ページ目の内容が自己紹介などで溢れて 2 ページ目に跨ることがある。
            跨いだページが見出し無しで始まらないよう、2 ページ目以降だけ継続ヘッダーを出す。 */}
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

      {skillsPageRenders && (
        <Page size="A4" style={printStyles.page}>
          {/* スキル一覧は自己紹介本文を含むため 2 ページに跨ることがある。
              跨いだページが見出し無しで始まらないよう、2 ページ目以降だけ継続ヘッダーを出す。 */}
          <DynamicView
            fixed
            style={continuationStyles.header}
            render={({ subPageNumber }) =>
              subPageNumber !== undefined && subPageNumber > 1 ? (
                <View style={continuationStyles.inner}>
                  <PrintText style={continuationStyles.text}>スキル一覧（続き）</PrintText>
                </View>
              ) : null
            }
          />
          <SkillsPage
            groups={vm.skillGroups}
            expertiseRows={vm.summary.expertiseRows}
            skillEmphasisMode={vm.skillEmphasisMode}
          />
          {footer}
        </Page>
      )}

      {projectPages.length > 0 && <ProjectPages pages={projectPages} footer={footer} />}
    </Document>
  );
}

export default PrintSkillSheetDocument;
