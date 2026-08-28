/**
 * 提出用 PDF の組み立て。デザイン（Skillsheet Redesign）の部品を Page に並べる。
 *
 * 3 層構造にしている。エージェントが最初に読む 1 ページ、企業の PM が読む案件セクション、
 * 経歴の裏付けとして流し見されるスキル一覧、という読まれ方に合わせたもの。
 *
 * 案件セクションを 1 つの `<Page>` にまとめているのは、会社ごとに Page を分けると
 * 案件が 1〜2 件しかない会社（実データで 19 社のうち 12 社）の後ろに大きな空白が出て、
 * ページ数がむやみに増えるため。ページ跨ぎの見出しは、この Page の最後の子に置いた
 * 1 つの継続見出し（下記）が会社・案件どちらの分もまとめて担う。
 */

import { Document, Page, StyleSheet, View } from '@react-pdf/renderer';
import type { Block } from '@skillsheet/db/blocks';

import { CompanyHeading } from './company-heading';
import { createSpanTracker, DynamicView, PrintText, printStyles, RunningFooter } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE } from './print-tokens';
import type { PrintCompany, PrintViewKey } from './print-view-model';
import { buildPrintViewModel } from './print-view-model';
import { CompactTableHeader, ProjectCardCompact } from './project-card-compact';
import { ProjectCardDetail } from './project-card-detail';
import { SkillsPage } from './skills-page';
import { SummaryPage } from './summary-page';

const styles = StyleSheet.create({
  // 会社セクション全体を囲むレール。borderLeftWidth は折り返す View でもページ断片ごとに
  // 再描画される（実測、react-pdf-capability.node.test.tsx の H）ので wrap={false} は不要。
  // paddingLeft がレールから見出し帯・カードまでの間隔を作る。
  companySection: {
    marginBottom: PRINT_SIZE.companySectionGap,
    borderLeftWidth: PRINT_SIZE.companyRailWidth,
    borderLeftColor: PRINT_COLOR.rule,
    paddingLeft: PRINT_SIZE.companyRailIndent,
  },
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
  compactGroup: { marginTop: PRINT_SIZE.cardGap },
  // 会社の終わり。帯にすると重いので、短い罫線 1 本だけでセクションが閉じたことを示す。
  companyEndMarker: {
    marginTop: 8,
    width: PRINT_SIZE.companyEndMarkerWidth,
    borderBottomWidth: PRINT_SIZE.ruleStrong,
    borderBottomColor: PRINT_COLOR.rule,
  },
});

type Tracker = ReturnType<typeof createSpanTracker>;

/**
 * 簡約表 1 区間ぶん。列ヘッダーは先頭案件と 1 つの `wrap={false}` 単位に束ねて、
 * データ行 0 件のまま列ヘッダーだけが改ページするのを防ぐ（project-card-compact.tsx の
 * leadingHeader コメント参照）。2 ページ目以降の継続ヘッダーは、先頭案件が実際に乗った
 * ページを覚えて `fixed` で出す（継続ヘッダー自身には開始ページを記録させない）。
 * この区間はどの案件も 1 ページに収まる前提の簡約表なので、詳細版カードの幽霊ヘッダー
 * 問題（project-card-detail.tsx 冒頭のコメント参照）は起きない。
 */
function CompactRun({ projects }: { projects: PrintCompany['projects'] }) {
  const [first, ...rest] = projects;
  let headerPage: number | undefined;
  return (
    <View style={styles.compactGroup}>
      <DynamicView
        fixed
        render={(pageProps) =>
          headerPage !== undefined && pageProps.pageNumber > headerPage ? <CompactTableHeader /> : null
        }
      />
      {first && (
        <ProjectCardCompact
          project={first}
          leadingHeader={<CompactTableHeader />}
          onLeadingHeaderPage={(pageProps) => {
            if (headerPage === undefined || pageProps.pageNumber < headerPage) headerPage = pageProps.pageNumber;
          }}
        />
      )}
      {rest.map((project) => (
        <ProjectCardCompact key={project.id} project={project} />
      ))}
    </View>
  );
}

/**
 * 会社 1 社ぶん。詳細版はカードとして 1 枚ずつ、簡約版は連続する分をまとめて
 * 1 つの表（列ヘッダーは先頭に 1 回だけ）にする。
 *
 * 会社の開始・終了ページは `companySpanTracker` に記録するだけで、「つづき」の表示判断は
 * しない（Page 直下に一本化した継続見出しがまとめて読む。理由は project-card-detail.tsx
 * 冒頭のコメント参照 — 条件付きレンダーをここに置くと同じ幽霊ヘッダーの壊れ方をする）。
 */
function CompanySection({
  company,
  projectSpanTracker,
  companySpanTracker,
}: {
  company: PrintCompany;
  projectSpanTracker: Tracker;
  companySpanTracker: Tracker;
}) {
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
      <CompanyHeading
        company={company}
        onFirstPage={(pageProps) => companySpanTracker.markStart(company.id, company.name, pageProps)}
      />
      {runs.map((run, runIndex) =>
        run.level === 'detail' ? (
          run.projects.map((project) => (
            <ProjectCardDetail key={project.id} project={project} spanTracker={projectSpanTracker} />
          ))
        ) : (
          // 連続する簡約案件を 1 つの表にまとめた塊。塊自体は並び順以外の識別子を持たず、
          // 会社内での位置がそのまま同一性になるので index を鍵に使う。
          // biome-ignore lint/suspicious/noArrayIndexKey: 塊は並び順でしか識別できない
          <CompactRun key={`compact-${runIndex}`} projects={run.projects} />
        ),
      )}
      <DynamicView
        render={(pageProps) => {
          companySpanTracker.markEnd(company.id, pageProps);
          return null;
        }}
      />
      <View style={styles.companyEndMarker} />
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
  // カード・会社それぞれの開始・終了ページを覚える器は、この描画 1 回ぶんだけ生きる。
  // モジュール変数にすると前回の描画の記録が残り、継続ヘッダーの判定が狂う。
  const projectSpanTracker = createSpanTracker();
  const companySpanTracker = createSpanTracker();
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
          style={styles.continuationHeader}
          render={({ subPageNumber }) =>
            subPageNumber !== undefined && subPageNumber > 1 ? (
              <View style={styles.continuationInner}>
                <PrintText style={styles.continuationText}>{`${vm.summary.sheetTitle}（続き）`}</PrintText>
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
            <CompanySection
              key={company.id}
              company={company}
              projectSpanTracker={projectSpanTracker}
              companySpanTracker={companySpanTracker}
            />
          ))}
          {footer}
          {/*
            会社・案件どちらの継続見出しもここ 1 箇所に一本化する（Page の最後の子。
            この Page 内の会社・案件それぞれの開始・終了マーカーより後に解決させるため）。
            カードや会社の枠の内側に置かない理由は project-card-detail.tsx 冒頭のコメント
            参照。案件が続いているページは会社も必ず続いている（案件は会社をまたがない）ので、
            両方が続いているときは 1 行にまとめる。
          */}
          <DynamicView
            fixed
            style={styles.continuationHeader}
            render={(pageProps) => {
              if (pageProps.subPageNumber === undefined) return null;
              const companyLabel = companySpanTracker.openLabel(pageProps.pageNumber);
              const projectLabel = projectSpanTracker.openLabel(pageProps.pageNumber);
              if (!companyLabel && !projectLabel) return null;
              const text = projectLabel
                ? companyLabel
                  ? `${companyLabel}（つづき）　${projectLabel}（続き）`
                  : `${projectLabel}（続き）`
                : `${companyLabel}（つづき）`;
              return (
                <View style={styles.continuationInner}>
                  <PrintText style={styles.continuationText}>{text}</PrintText>
                </View>
              );
            }}
          />
        </Page>
      )}
    </Document>
  );
}

export default PrintSkillSheetDocument;
