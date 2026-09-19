'use client';

import type { CompanyInfo, ProjectItem } from '@/db/block';
import { resolveCompanyPeriod } from '@/db/derived-display';
import { resolveDuration } from '@/db/duration';
import { companyDisplayName } from '@/db/group-by-company';
import { formatPeriodDisplay } from '@/db/process';
import { sanitizeHtml } from '@/db/sanitize-html';
import { CompanyLane } from './company-lane';
import { ProjectCard } from './project-card';

export interface NumberedProject {
  item: ProjectItem;
  no: number;
  tech: string[];
}

export function companyTenureLabel(period: string, showDuration = true, referenceMonth?: number): string {
  const trimmed = period.trim();
  if (!trimmed) return '';
  const display = formatPeriodDisplay(trimmed);
  // 月数はカード・PDF と同じ resolveDuration で導出する（'N年Nヶ月' 形式に統一し、
  // ローカルの「（61ヶ月）」表記をやめる #354）。「〜現在」は基準月があれば導出される。
  // 未確定・0ヶ月は書いていない精度を勝手に足さないよう括弧を出さない。
  // 「稼働月数」トグル OFF では同じ判定で隠す — カードだけ消えて会社見出しに残る、
  // という半端な状態を避けるため。
  const resolved = showDuration ? resolveDuration(trimmed, undefined, referenceMonth) : null;
  return resolved?.derivedMonths ? `在籍 ${display}（${resolved.label}）` : `在籍 ${display}`;
}

export function companyCountLabel(shown: number, total: number, isSearching: boolean): string {
  return isSearching ? `一致 ${shown} / 案件 ${total} 件` : `案件 ${total} 件`;
}

interface CompanySectionProps {
  referenceMonth?: number;
  companyId: string;
  /** 同じ会社 ID を持つ project ブロックが 2 つあるときに id が衝突しないようにする接尾辞。 */
  headingIdSuffix?: string;
  company: CompanyInfo | undefined;
  items: NumberedProject[];
  /** 検索で絞り込む前の会社配下案件。期間導出が検索条件で変わらないように使う。 */
  allCompanyItems?: ProjectItem[];
  totalCount: number;
  isSearching: boolean;
  activeTech: string[];
  queryTerms: string[];
  /** 稼働月数（在籍月数・レーンの月数・カードの期間括弧）を出すか。既定 true。 */
  showDuration?: boolean;
}

export function CompanySection({
  referenceMonth,
  companyId,
  headingIdSuffix,
  company,
  items,
  allCompanyItems,
  totalCount,
  isSearching,
  activeTech,
  queryTerms,
  showDuration = true,
}: CompanySectionProps) {
  const name = companyDisplayName(company);
  const periodItems = allCompanyItems ?? items.map(({ item }) => item);
  const effectivePeriod = resolveCompanyPeriod(company, periodItems);
  const tenure = companyTenureLabel(effectivePeriod, showDuration, referenceMonth);
  const note = company?.note?.trim() ?? '';
  const kind = company?.kind?.trim() ?? '';
  const countLabel = companyCountLabel(items.length, totalCount, isSearching);
  const laneItems = items.map(({ item, no }) => ({
    no: String(no).padStart(2, '0'),
    period: item.period,
    // カード・タイムライン・PDF と同じ判定（resolveDuration）。トグル OFF なら空にして
    // レーン右端の月数欄ごと出さない。
    duration: showDuration ? resolveDuration(item.period, item.duration, referenceMonth).label : '',
  }));

  return (
    <section
      id={`company-${companyId}${headingIdSuffix ?? ''}`}
      aria-label={tenure ? `${name}（${effectivePeriod}）` : name}
      className="flex min-w-0 scroll-mt-40 flex-col gap-4 sm:scroll-mt-[4.75rem]"
    >
      <div className="sticky top-40 z-20 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-b border-border bg-background py-2.5 sm:top-[4.75rem]">
        {/* ToC は h1..h6[id] を拾う。section 側の id は #company-<id> リンクの
            到着点として残し（company-jump-nav と既存 e2e が参照）、h2 には
            派生 id を付けて目次へ出す（#355）。scroll-mt は sticky topbar の高さ分。 */}
        <h2
          id={`company-${companyId}${headingIdSuffix ?? ''}-heading`}
          className="text-[19px] font-semibold leading-snug text-foreground sm:text-[22px]"
        >
          {name}
        </h2>
        {kind ? (
          <span className="rounded bg-accent-soft px-2 py-0.5 text-[11px] leading-normal text-accent-text">{kind}</span>
        ) : null}
        {tenure ? <span className="font-mono text-[12px] leading-normal text-foreground">{tenure}</span> : null}
        <span className="font-mono text-[12px] leading-normal text-muted-foreground">{countLabel}</span>
      </div>

      {note ? <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-foreground">{sanitizeHtml(note)}</p> : null}

      <CompanyLane companyPeriod={effectivePeriod} items={laneItems} />

      <div className="flex min-w-0 flex-col gap-4">
        {items.map(({ item, no, tech }) => (
          <ProjectCard
            key={item.id}
            item={item}
            no={no}
            companyName={name}
            tech={tech}
            activeTech={activeTech}
            queryTerms={queryTerms}
            showDuration={showDuration}
            referenceMonth={referenceMonth}
          />
        ))}
      </div>
    </section>
  );
}
