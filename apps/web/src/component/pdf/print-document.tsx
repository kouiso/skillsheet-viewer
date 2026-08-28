/**
 * 提出用 PDF の組み立て。デザイン（Skillsheet Redesign）の部品を Page に並べる。
 *
 * 3 層構造にしている。エージェントが最初に読む 1 ページ、企業の PM が読む案件セクション、
 * 経歴の裏付けとして流し見されるスキル一覧、という読まれ方に合わせたもの。
 *
 * 案件セクションを 1 つの `<Page>` にまとめているのは、会社ごとに Page を分けると
 * 案件が 1〜2 件しかない会社（実データで 19 社のうち 12 社）の後ろに大きな空白が出て、
 * ページ数がむやみに増えるため。ページ跨ぎの見出しは、カード内に置いた `fixed` の
 * 継続ヘッダー（`ProjectCardDetail`）が担う。
 */

import { Document, Page, StyleSheet, View } from '@react-pdf/renderer';
import type { Block } from '@skillsheet/db/blocks';

import { CompanyHeading } from './company-heading';
import { createFirstPageTracker, DynamicView, PrintText, printStyles, RunningFooter } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE } from './print-tokens';
import type { PrintCompany, PrintViewKey } from './print-view-model';
import { buildPrintViewModel } from './print-view-model';
import { CompactTableHeader, ProjectCardCompact } from './project-card-compact';
import { ProjectCardDetail } from './project-card-detail';
import { SkillsPage } from './skills-page';
import { SummaryPage } from './summary-page';

const styles = StyleSheet.create({
  companySection: { marginBottom: PRINT_SIZE.companySectionGap },
  // ページ跨ぎの継続ヘッダー。**height を与えないこと**（与えると描画が消える）。
  // 外枠は位置だけを持つ。罫線を外枠に付けると、継続ヘッダーを出さない 1 ページ目にも
  // 線だけが描かれる（render が null を返しても枠のスタイルは適用される）。
  continuationHeader: {
    position: 'absolute',
    top: PRINT_SIZE.headerTop,
    left: PRINT_SIZE.padHorizontal,
    right: PRINT_SIZE.padHorizontal,
  },
  continuationInner: {
    borderBottomWidth: PRINT_SIZE.ruleThin,
    borderBottomColor: PRINT_COLOR.rule,
    paddingBottom: 4,
  },
  continuationText: { ...PRINT_TYPE.meta, fontWeight: 700, color: PRINT_COLOR.accent },
  cardSpacing: { marginTop: PRINT_SIZE.cardGap },
  compactGroup: { marginTop: PRINT_SIZE.cardGap },
});

type Tracker = ReturnType<typeof createFirstPageTracker>;

/**
 * 会社 1 社ぶん。詳細版はカードとして 1 枚ずつ、簡約版は連続する分をまとめて
 * 1 つの表（列ヘッダーは先頭に 1 回だけ）にする。
 */
function CompanySection({ company, tracker }: { company: PrintCompany; tracker: Tracker }) {
  // 簡約版が連続する区間をまとめる。会社の中で詳細版と簡約版が交互に現れても、
  // 列ヘッダーが必要な回数だけ出るようにする。
  const runs: { level: 'detail' | 'compact'; projects: PrintCompany['projects'] }[] = [];
  for (const project of company.projects) {
    const last = runs.at(-1);
    if (last && last.level === project.level && project.level === 'compact') {
      last.projects.push(project);
    } else {
      runs.push({ level: project.level, projects: [project] });
    }
  }

  return (
    <View style={styles.companySection}>
      <CompanyHeading company={company} />
      {runs.map((run, runIndex) =>
        run.level === 'detail' ? (
          run.projects.map((project) => (
            <View key={project.id} style={styles.cardSpacing}>
              <ProjectCardDetail project={project} tracker={tracker} />
            </View>
          ))
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 区間は並び順そのものが同一性で、安定 id を持たない
          <View key={`compact-${runIndex}`} style={styles.compactGroup}>
            {/* 列ヘッダーを fixed にして、この表が跨いだ全ページの先頭に出す。
                簡約版は本文を丸ごと載せるので複数ページに跨り、跨いだ先が
                見出し無しのページになるのを防ぐ（表として自然な繰り返しでもある）。 */}
            <View fixed>
              <CompactTableHeader />
            </View>
            {run.projects.map((project) => (
              <ProjectCardCompact key={project.id} project={project} />
            ))}
          </View>
        ),
      )}
    </View>
  );
}

export interface PrintSkillSheetDocumentProps {
  title: string;
  blocks: Block[];
  /** 画面のビュートグルの状態。未指定は全 ON（画面側 isViewOn と同じ既定）。 */
  views?: PrintViewKey[];
}

export function PrintSkillSheetDocument({ title, blocks, views }: PrintSkillSheetDocumentProps) {
  const vm = buildPrintViewModel(title, blocks, views);
  // カードの開始ページを覚える器は、この描画 1 回ぶんだけ生きる。
  // モジュール変数にすると前回の描画の記録が残り、継続ヘッダーの判定が狂う。
  const tracker = createFirstPageTracker();
  const footer = <RunningFooter name={vm.summary.name} sheetTitle={vm.summary.sheetTitle} />;

  return (
    <Document title={title}>
      <Page size="A4" style={printStyles.page}>
        <SummaryPage summary={vm.summary} showProcess={vm.showProcess} />
        {footer}
      </Page>

      {vm.showSkills && vm.skillGroups.length > 0 && (
        <Page size="A4" style={printStyles.page}>
          {/* スキル一覧は自己紹介本文を含むため 2 ページに跨ることがある。
              跨いだページが見出し無しで始まらないよう、2 ページ目以降だけ継続ヘッダーを出す。 */}
          <DynamicView
            fixed
            style={styles.continuationHeader}
            render={({ subPageNumber }) =>
              subPageNumber !== undefined && subPageNumber > 1 ? (
                <View style={styles.continuationInner}>
                  <PrintText style={styles.continuationText}>スキル一覧（続き）</PrintText>
                </View>
              ) : null
            }
          />
          <SkillsPage groups={vm.skillGroups} expertiseRows={vm.summary.expertiseRows} />
          {footer}
        </Page>
      )}

      {vm.showProjects && vm.companies.length > 0 && (
        <Page size="A4" style={printStyles.page}>
          {vm.companies.map((company) => (
            <CompanySection key={company.id} company={company} tracker={tracker} />
          ))}
          {footer}
        </Page>
      )}
    </Document>
  );
}

export default PrintSkillSheetDocument;
