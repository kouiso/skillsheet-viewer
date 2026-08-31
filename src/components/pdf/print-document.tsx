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
import type { Block } from '@/db/blocks';

import { CompanyHeading } from './company-heading';
import { createSpanTracker, DynamicView, PrintText, printStyles, RunningFooter } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE } from './print-tokens';
import type { PrintCompany, PrintViewKey } from './print-view-model';
import { buildPrintViewModel, fitContinuationHeading } from './print-view-model';
import { CompactTableHeader, ProjectCardCompact } from './project-card-compact';
import { ProjectCardDetail } from './project-card-detail';
import { SkillsPage } from './skills-page';
import { SummaryPage } from './summary-page';

const styles = StyleSheet.create({
  // 会社セクション全体を囲むレール。borderLeftWidth は折り返す View でもページ断片ごとに
  // 再描画される（実測、react-pdf-capability.node.test.tsx の H）ので wrap={false} は不要。
  // paddingLeft がレールから見出し帯・カードまでの間隔を作る。
  /**
   * 会社セクション左のレール（縦罫線）と、その内側の余白。
   *
   * **会社の全体を 1 枚の View で囲ってレールを持たせてはいけない。** 囲うと、余白が
   * 足りず見出しが次ページへ送られたときに囲いの View だけが前のページに断片として
   * 残り、中身の無い縦線がページ下端まで伸びる（実測: 42 ページ版の p15）。
   * 見出しと案件の並びにそれぞれ当てて、送られるときは線も一緒に送られるようにする。
   */
  companyRail: {
    borderLeftWidth: PRINT_SIZE.companyRailWidth,
    borderLeftColor: PRINT_COLOR.rule,
    paddingLeft: PRINT_SIZE.companyRailIndent,
  },
  /** 案件の並び。会社と会社の間隔はここで作る（見出し側に付けると帯の上が空く）。 */
  companyBody: {
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
  // maxLines / textOverflow は @react-pdf では props ではなく **style** で渡す
  // （@react-pdf/layout の getMaxLines は node.style を見る）。
  // 2 行目は本文の 1 行目に重なるので、文字列側（fitContinuationHeading）で 1 行に
  // 収めたうえで、ここでも折り返しを禁じて二重に塞ぐ。
  continuationText: {
    ...PRINT_TYPE.meta,
    fontWeight: 700,
    color: PRINT_COLOR.accent,
    maxLines: 1,
    textOverflow: 'ellipsis',
  },
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
 * 会社見出しの後ろに要求する高さ（pt）。
 *
 * 最初のカードが 1 ページに収まる大きさのときは、**そのカードごと入る高さ**を要求する。
 * 固定値（240pt）だけだと、見出しは残り 300pt のページに乗るのに、分割禁止の 500pt の
 * カードは丸ごと次ページへ行き、見出しと会社概要だけがページの末尾に取り残される
 * （実測: 42 ページ版の p19、E 社の見出しの下が 1 枚まるごと白かった）。
 *
 * 1 ページに収まらないカード（`fitsOnePage === false`）は分割されて見出しの直後から
 * 描かれ始めるので、取り残されない。その場合は既定の 240pt でよい。
 *
 * 上限を置くのは、要求が満たせない大きさになると「送っても解決しない」からで、
 * その時は 240pt と同じ挙動に落ちる。見出し 1 つ分（帯 + 概要 2 行）を実測で約 110pt と
 * 見て、本文の高さ 754pt から引いた残りを上限にする。カードの見積りは安全側に大きめへ
 * 振ってあるので、上限に当たったカードも実際の高さでは収まることが多い。
 */
const HEADING_BLOCK_HEIGHT = 110;
const MAX_ROOM_AFTER_HEADING = PRINT_SIZE.cardMaxSinglePageHeight - HEADING_BLOCK_HEIGHT;

function requiredRoomAfterHeading(company: PrintCompany): number | undefined {
  const first = company.projects[0];
  if (!first?.fitsOnePage) return undefined;
  return Math.min(first.estimatedHeight + PRINT_SIZE.cardGap, MAX_ROOM_AFTER_HEADING);
}

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
    <>
      {/*
        会社の見出しと案件の並びを、**Page 直下の兄弟として並べる**（会社全体を 1 枚の
        View で囲わない）。理由は 2 つあり、どちらもページ割りの実装に由来する。

        1. 見出しの「後ろにこれだけ余白が要る」（minPresenceAhead）は、その見出しに
           先行する兄弟がいないと無視される。@react-pdf は「親の最初の子は既にページの
           先頭にいる」と見なして判断を省くため（layout の shouldBreak の
           breakingImprovesPresence）。会社全体を囲うと見出しは必ずその最初の子になり、
           余白の要求が 120 でも 320 でも出力が 1 ページも変わらなかった（実測）。
           Page 直下なら前の会社が先行兄弟になるので、そのまま効く。

        2. 囲った View に左のレール（縦罫線）を持たせると、見出しが次ページへ送られた
           ときに囲いの断片だけが前のページに残り、中身の無い縦線がページ下端まで伸びる。
           レールを見出しと案件それぞれに持たせれば、送られるときは線も一緒に送られる。
      */}
      <CompanyHeading
        company={company}
        railStyle={styles.companyRail}
        minPresenceAhead={requiredRoomAfterHeading(company)}
        onFirstPage={(pageProps) => companySpanTracker.markStart(company.id, company.name, pageProps)}
      />
      <View style={styles.companyBody}>
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
    </>
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
              // 2 行に折り返すと 2 行目が本文の 1 行目に重なる（絶対配置で高さを持たないため）。
              // 収まらないときに何を落とすかの判断は fitContinuationHeading に一本化する。
              const text = fitContinuationHeading(companyLabel, projectLabel);
              if (!text) return null;
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
