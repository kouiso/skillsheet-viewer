'use client';

import type { CompanyInfo, ProjectItem } from '@/db/blocks';
import { resolveCompanyPeriod } from '@/db/derived-display';
import { companyDisplayName } from '@/db/group-by-company';
import { deriveDuration, formatPeriodDisplay, parsePeriodBounds } from '@/db/process';
import { sanitizeHtml } from '@/util/sanitize-html';
import { CompanyLane } from './company-lane';
import { ProjectCard } from './project-card';

export interface NumberedProject {
  item: ProjectItem;
  no: number;
  tech: string[];
}

export function companyTenureLabel(period: string): string {
  const trimmed = period.trim();
  if (!trimmed) return '';
  const bounds = parsePeriodBounds(trimmed);
  const display = formatPeriodDisplay(trimmed);
  // 年だけの表記・終了未記載・終端「現在」は月数を数えない。数えると `2020` が
  // 「在籍 2020（1ヶ月）」になり、書いていない精度を勝手に足すことになる。
  if (!bounds?.precise || bounds.openEnded) return `在籍 ${display}`;
  const months = Math.round((bounds.end - bounds.start) * 12) + 1;
  return months > 0 ? `在籍 ${display}（${months}ヶ月）` : `在籍 ${display}`;
}

export function companyCountLabel(shown: number, total: number, isSearching: boolean): string {
  return isSearching ? `一致 ${shown} / 案件 ${total} 件` : `案件 ${total} 件`;
}

interface CompanySectionProps {
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
}

export function CompanySection({
  companyId,
  headingIdSuffix,
  company,
  items,
  allCompanyItems,
  totalCount,
  isSearching,
  activeTech,
  queryTerms,
}: CompanySectionProps) {
  const name = companyDisplayName(company);
  const periodItems = allCompanyItems ?? items.map(({ item }) => item);
  const effectivePeriod = resolveCompanyPeriod(company, periodItems);
  const tenure = companyTenureLabel(effectivePeriod);
  const note = company?.note?.trim() ?? '';
  const kind = company?.kind?.trim() ?? '';
  const countLabel = companyCountLabel(items.length, totalCount, isSearching);
  const laneItems = items.map(({ item, no }) => ({
    no: String(no).padStart(2, '0'),
    period: item.period,
    duration: item.duration?.trim() || deriveDuration(item.period),
  }));

  return (
    <section
      id={`company-${companyId}${headingIdSuffix ?? ''}`}
      aria-label={tenure ? `${name}（${effectivePeriod}）` : name}
      className="flex min-w-0 scroll-mt-40 flex-col gap-4 sm:scroll-mt-[4.75rem]"
    >
      <div className="sticky top-40 z-20 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-b border-border bg-background py-2.5 sm:top-[4.75rem]">
        <h2 className="text-[19px] font-semibold leading-snug text-foreground sm:text-[22px]">{name}</h2>
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
          <ProjectCard key={item.id} item={item} no={no} tech={tech} activeTech={activeTech} queryTerms={queryTerms} />
        ))}
      </div>
    </section>
  );
}
