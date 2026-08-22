'use client';

import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { companyDisplayName } from '@skillsheet/db/group-by-company';
import { deriveDuration, formatPeriodDisplay, parsePeriodBounds } from '@skillsheet/db/process';
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
  const months = bounds ? Math.round((bounds.end - bounds.start) * 12) + 1 : 0;
  const display = formatPeriodDisplay(trimmed);
  return months > 0 ? `在籍 ${display}（${months}ヶ月）` : `在籍 ${display}`;
}

export function companyCountLabel(shown: number, total: number, isSearching: boolean): string {
  return isSearching ? `一致 ${shown} / 案件 ${total} 件` : `案件 ${total} 件`;
}

interface CompanySectionProps {
  companyId: string;
  company: CompanyInfo | undefined;
  items: NumberedProject[];
  totalCount: number;
  isSearching: boolean;
  activeTech: string[];
  queryTerms: string[];
}

export function CompanySection({
  companyId,
  company,
  items,
  totalCount,
  isSearching,
  activeTech,
  queryTerms,
}: CompanySectionProps) {
  const name = companyDisplayName(company);
  const tenure = companyTenureLabel(company?.period ?? '');
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
      id={`company-${companyId}`}
      aria-label={tenure ? `${name}（${company?.period}）` : name}
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

      <CompanyLane companyPeriod={company?.period ?? ''} items={laneItems} />

      <div className="flex min-w-0 flex-col gap-4">
        {items.map(({ item, no, tech }) => (
          <ProjectCard key={item.id} item={item} no={no} tech={tech} activeTech={activeTech} queryTerms={queryTerms} />
        ))}
      </div>
    </section>
  );
}
