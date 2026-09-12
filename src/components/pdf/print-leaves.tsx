/**
 * 案件セクションのビューモデルを measure-then-place の葉に分解する。
 *
 * ここが「何をどの単位で置くか」を決める唯一の場所。会社見出し・概要・カードヘッダー・
 * メタ表・技術チップの分類・小見出し・段落・箇条書き 1 項目・簡約表の行 をそれぞれ 1 葉に
 * する。枠（レール・カードの辺・余白）は `FrameSpec` として持たせ、測定と描画の両方が
 * `frameLeaf` で同じ幅に展開する。
 *
 * かつて `wrap` / `minPresenceAhead` / 高さ 0 の先行兄弟 で表現しようとしていた制約は
 * `keepWithNext` と葉の粒度に置き換わった:
 *  - 見出し類（会社見出し・概要・カードヘッダー・小見出し・列ヘッダー）は次の葉と同居
 *  - 記号と本文は 1 つの葉（箇条書き記号だけが前ページに残ることは構造上起きない）
 *  - チップは分類ごと 1 葉（半端に切れない）
 */

import type { ReactElement } from 'react';

import { CompanyHeadingBand, CompanyNote } from './company-heading';
import { fitContinuationHeading } from './print-continuation-heading';
import type { FrameSpec, Leaf, MeasuredLeaf, MeasuredLine } from './print-leaf';
import { markdownPieces } from './print-markdown';
import type { PrintPage } from './print-paginate';
import { MetaTable, SectionLabel, TechChipGroup } from './print-primitives';
import { splitTextAtLine } from './print-split-text';
import { PRINT_SIZE } from './print-tokens';
import type { PrintCompany, PrintProject, PrintViewModel } from './print-view-model';
import { COMPACT_GROUP_PAD_BOTTOM, CompactRow, CompactTableHeader, compactBodyPieces } from './project-card-compact';
import { DETAIL_HEADER_PAD, ProjectCardHeader } from './project-card-detail';

/** 詳細版カードのブロックの余白（print-tokens の cardPad と同じ）。 */
const BLOCK_PAD = { vertical: PRINT_SIZE.cardPadVertical, horizontal: PRINT_SIZE.cardPadHorizontal };
/** 技術チップの分類同士の間隔（print-primitives の techGroupSpaced と同じ）。 */
const TECH_GROUP_GAP = 5;

const railFrame = (over: Partial<FrameSpec> = {}): FrameSpec => ({
  rail: true,
  gapAbove: 0,
  marginBottom: 0,
  card: null,
  indent: 0,
  endMarker: false,
  ...over,
});

type DetailBlock = 'meta' | 'tech' | 'duties' | 'acquired' | 'comment';

interface LeafDraft {
  kind: Leaf['kind'];
  el: ReactElement;
  keepWithNext: boolean;
  text?: string;
  remake?: (text: string) => ReactElement;
  frame: FrameSpec;
}

function draftToLeaf(
  draft: LeafDraft,
  id: string,
  common: Pick<Leaf, 'companyId' | 'companyLabel' | 'cardId' | 'cardLabel' | 'cardLevel' | 'groupId'>,
): Leaf {
  const splittable = draft.text !== undefined && draft.remake ? 'lines' : 'never';
  return {
    id,
    kind: draft.kind,
    ...common,
    el: draft.el,
    frame: draft.frame,
    keepWithNext: draft.keepWithNext,
    splittable,
    ...(splittable === 'lines' ? { text: draft.text, remake: draft.remake } : {}),
  };
}

/** 詳細版カード 1 枚ぶんの葉。カードの辺は先頭の葉に上辺、末尾の葉に下辺を静的に割り当てる。 */
function detailCardDrafts(project: PrintProject): LeafDraft[] {
  const present: DetailBlock[] = [];
  if (project.metaRows.length > 0) present.push('meta');
  if (project.techGroups.length > 0) present.push('tech');
  if (project.duties) present.push('duties');
  if (project.acquired) present.push('acquired');
  if (project.comment) present.push('comment');
  const lastBlock = present[present.length - 1];

  const drafts: LeafDraft[] = [];
  const cardFrame = (over: Partial<NonNullable<FrameSpec['card']>>): FrameSpec =>
    railFrame({
      card: {
        top: false,
        bottom: false,
        sides: true,
        padTop: 0,
        padBottom: 0,
        padHorizontal: 0,
        surface: false,
        divider: false,
        ...over,
      },
    });

  drafts.push({
    kind: 'card-header',
    el: <ProjectCardHeader project={project} />,
    keepWithNext: true,
    frame: cardFrame({
      top: true,
      bottom: present.length === 0,
      padTop: DETAIL_HEADER_PAD.vertical,
      padBottom: DETAIL_HEADER_PAD.vertical,
      padHorizontal: DETAIL_HEADER_PAD.horizontal,
      surface: true,
      divider: present.length > 0,
    }),
  });

  for (const block of present) {
    const isLast = block === lastBlock;
    if (block === 'meta') {
      drafts.push({
        kind: 'meta',
        el: <MetaTable rows={project.metaRows} />,
        keepWithNext: false,
        frame: cardFrame({ bottom: isLast, divider: !isLast }),
      });
      continue;
    }
    if (block === 'tech') {
      project.techGroups.forEach((group, index) => {
        const isLastGroup = index === project.techGroups.length - 1;
        drafts.push({
          kind: 'tech-group',
          el: <TechChipGroup group={group} spaced={false} />,
          keepWithNext: false,
          frame: cardFrame({
            padTop: index === 0 ? BLOCK_PAD.vertical : TECH_GROUP_GAP,
            padBottom: isLastGroup ? BLOCK_PAD.vertical : 0,
            padHorizontal: BLOCK_PAD.horizontal,
            bottom: isLast && isLastGroup,
            divider: !isLast && isLastGroup,
          }),
        });
      });
      continue;
    }
    const label = block === 'duties' ? '業務内容' : block === 'acquired' ? '習得スキル・実績' : 'コメント';
    const text = block === 'duties' ? project.duties : block === 'acquired' ? project.acquired : project.comment;
    const surface = block === 'acquired';
    const pieces = markdownPieces(text);
    drafts.push({
      kind: 'section-label',
      el: <SectionLabel>{label}</SectionLabel>,
      keepWithNext: true,
      frame: cardFrame({
        padTop: BLOCK_PAD.vertical,
        padBottom: pieces.length === 0 ? BLOCK_PAD.vertical : 0,
        padHorizontal: BLOCK_PAD.horizontal,
        surface,
        bottom: isLast && pieces.length === 0,
        divider: !isLast && pieces.length === 0,
      }),
    });
    pieces.forEach((piece, index) => {
      const isLastPiece = index === pieces.length - 1;
      drafts.push({
        kind: piece.kind,
        el: piece.el,
        keepWithNext: piece.keepWithNext ?? false,
        text: piece.text,
        remake: piece.remake,
        frame: {
          ...cardFrame({
            padTop: piece.gap,
            padBottom: isLastPiece ? BLOCK_PAD.vertical : 0,
            padHorizontal: BLOCK_PAD.horizontal,
            surface,
            bottom: isLast && isLastPiece,
            divider: !isLast && isLastPiece,
          }),
          indent: piece.indent,
        },
      });
    });
  }
  return drafts;
}

/** 簡約版 1 案件ぶんの葉（1 段目の行 + 2 段目のブロック）。案件の下端に罫線を 1 本置く。 */
function compactProjectDrafts(project: PrintProject): LeafDraft[] {
  const body = compactBodyPieces(project);
  const groupFrame = (last: boolean): FrameSpec =>
    railFrame({
      card: {
        top: false,
        bottom: last,
        sides: false,
        padTop: 0,
        padBottom: last ? COMPACT_GROUP_PAD_BOTTOM : 0,
        padHorizontal: 0,
        surface: false,
        divider: false,
      },
    });
  const drafts: LeafDraft[] = [
    {
      kind: 'compact-row',
      el: <CompactRow project={project} />,
      keepWithNext: false,
      frame: groupFrame(body.length === 0),
    },
  ];
  body.forEach((piece, index) => {
    drafts.push({
      kind: 'compact-body',
      el: piece.el,
      keepWithNext: piece.keepWithNext,
      text: piece.text,
      remake: piece.remake,
      frame: groupFrame(index === body.length - 1),
    });
  });
  return drafts;
}

function companyLeaves(company: PrintCompany, seq: { n: number }): Leaf[] {
  const leaves: Leaf[] = [];
  const nextId = (kind: string) => `${kind}-${++seq.n}`;
  const base = { companyId: company.id, companyLabel: company.name };

  leaves.push({
    id: nextId('company'),
    kind: 'company-heading',
    ...base,
    el: <CompanyHeadingBand company={company} />,
    frame: railFrame(),
    keepWithNext: true,
    splittable: 'never',
  });
  if (company.note !== '') {
    const remake = (text: string) => <CompanyNote text={text} />;
    leaves.push({
      id: nextId('note'),
      kind: 'company-note',
      ...base,
      el: remake(company.note),
      frame: railFrame(),
      keepWithNext: true,
      splittable: 'lines',
      text: company.note,
      remake,
    });
  }

  // 簡約版が連続する区間をまとめる。会社の中で詳細版と簡約版が交互に現れても、
  // 列ヘッダーが必要な回数だけ出るようにする。
  const runs: { level: 'detail' | 'compact'; projects: PrintProject[] }[] = [];
  for (const project of company.projects) {
    const last = runs[runs.length - 1];
    if (last && last.level === project.level && project.level === 'compact') last.projects.push(project);
    else runs.push({ level: project.level, projects: [project] });
  }

  runs.forEach((run, runIndex) => {
    if (run.level === 'detail') {
      for (const project of run.projects) {
        const common = { ...base, cardId: project.id, cardLabel: project.title, cardLevel: 'detail' as const };
        detailCardDrafts(project).forEach((draft, index) => {
          const leaf = draftToLeaf(draft, nextId(draft.kind), common);
          // カード同士の間隔はカードの先頭の葉の上に取る（旧 styles.card の marginTop）。
          if (index === 0 && leaf.frame) leaf.frame = { ...leaf.frame, gapAbove: PRINT_SIZE.cardGap };
          leaves.push(leaf);
        });
      }
      return;
    }
    const groupId = `${company.id}-run-${runIndex}`;
    leaves.push({
      id: nextId('compact-header'),
      kind: 'compact-header',
      ...base,
      groupId,
      el: <CompactTableHeader />,
      frame: railFrame({ gapAbove: PRINT_SIZE.cardGap }),
      keepWithNext: true,
      splittable: 'never',
    });
    for (const project of run.projects) {
      const common = { ...base, cardId: project.id, cardLabel: project.title, cardLevel: 'compact' as const, groupId };
      for (const draft of compactProjectDrafts(project)) leaves.push(draftToLeaf(draft, nextId(draft.kind), common));
    }
  });

  // 会社の終わり: 最後の葉の直後に短い罫線、その下に会社同士の間隔。
  const last = leaves[leaves.length - 1];
  last.frame = { ...(last.frame ?? railFrame()), endMarker: true, marginBottom: PRINT_SIZE.companySectionGap };
  return leaves;
}

export function toLeaves(vm: PrintViewModel): Leaf[] {
  const seq = { n: 0 };
  return vm.companies.flatMap((company) => companyLeaves(company, seq));
}

/**
 * 段落を行境界で割った頭・尻の葉を作る。
 * 頭はカードの下辺・仕切り・終端マーカーを持たず、尻は上辺と上の余白を持たない
 * （どちらも「元の葉の続き」なので、枠が二重に閉じたり開いたりしないように）。
 */
export function splitLeaf(
  leaf: MeasuredLeaf,
  headLines: MeasuredLine[],
  tailLines: MeasuredLine[],
): { head: Leaf; tail: Leaf } | undefined {
  if (!leaf.remake || leaf.text === undefined || !leaf.lines) {
    throw new Error(`splitLeaf: 葉 ${leaf.id} は text / remake / lines を持たない`);
  }
  if (headLines.length + tailLines.length !== leaf.lines.length) return undefined;
  const texts = splitTextAtLine(leaf.text, leaf.lines, headLines.length);
  if (!texts) return undefined;
  const frame = leaf.frame ?? railFrame({ rail: false });
  const headFrame: FrameSpec = {
    ...frame,
    marginBottom: 0,
    endMarker: false,
    card: frame.card ? { ...frame.card, bottom: false, padBottom: 0, divider: false } : null,
  };
  const tailFrame: FrameSpec = {
    ...frame,
    gapAbove: 0,
    card: frame.card ? { ...frame.card, top: false, padTop: 0 } : null,
  };
  const { height: _h, marginTop: _mt, marginBottom: _mb, lines: _l, ...rest } = leaf;
  return {
    head: { ...rest, id: `${leaf.id}:head`, text: texts.head, el: leaf.remake(texts.head), frame: headFrame },
    tail: { ...rest, id: `${leaf.id}:tail`, text: texts.tail, el: leaf.remake(texts.tail), frame: tailFrame },
  };
}

/**
 * 前ページから続く簡約表の先頭に置く列ヘッダー。ページを跨いだ位置は割り付けで
 * 分かっているので、`fixed` + `render` で描画中に判断する必要が無い。
 */
export function compactContinuationLeaf(header: MeasuredLeaf) {
  return (first: MeasuredLeaf, previous: MeasuredLeaf): MeasuredLeaf | undefined => {
    if (!first.groupId || first.groupId !== previous.groupId) return undefined;
    if (first.kind === 'compact-header') return undefined;
    return { ...header, id: `${header.id}:${first.id}`, groupId: first.groupId, frame: railFrame() };
  };
}

/** 列ヘッダーを測るための葉（レール込みの幅で測る）。 */
export const COMPACT_HEADER_TEMPLATE: Leaf = {
  id: 'compact-header-template',
  kind: 'compact-header',
  companyId: '',
  el: <CompactTableHeader />,
  frame: railFrame(),
  keepWithNext: true,
  splittable: 'never',
};

/**
 * ページ上端の継続見出しの文字列。案件セクションの 2 ページ目以降で、先頭の葉が
 * 会社の途中（見出しでない）なら会社名、詳細版カードの途中ならその案件名も添える。
 * 案件は会社をまたがないので、両方が続いているときは 1 行にまとめる。
 */
export function continuationHeadingFor(page: PrintPage, pageIndex: number): string {
  if (pageIndex === 0) return '';
  const first = page.leaves.find((placed) => !placed.leadIn)?.leaf ?? page.leaves[0]?.leaf;
  if (!first) return '';
  const companyLabel = first.kind === 'company-heading' ? undefined : first.companyLabel;
  const projectLabel = first.cardLevel === 'detail' && first.kind !== 'card-header' ? first.cardLabel : undefined;
  return fitContinuationHeading(companyLabel, projectLabel);
}
