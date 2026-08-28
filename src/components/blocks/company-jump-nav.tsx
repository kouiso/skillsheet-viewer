'use client';

import type { CompanyInfo } from '@/db/blocks';
import { companyDisplayName } from '@/db/group-by-company';
import { formatMonthToken, parseStart, splitPeriodRange } from '@/db/process';

export interface JumpCompanyInput {
  companyId: string;
  company: CompanyInfo | undefined;
  count: number;
}

export interface JumpCompanyItem {
  href: string;
  name: string;
  qual: string;
  count: number;
}

export function buildCompanyJumpItems(groups: JumpCompanyInput[]): JumpCompanyItem[] {
  const names = groups.map((group) => companyDisplayName(group.company));
  const nameCount = new Map<string, number>();
  for (const name of names) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  return groups.map((group, index) => {
    const name = names[index];
    const dup = (nameCount.get(name) ?? 0) > 1;
    const period = group.company?.period ?? '';
    const [startToken] = splitPeriodRange(period);
    const start = parseStart(period);
    const qual = dup && start !== null ? `${formatMonthToken(startToken)}—` : '';
    return {
      href: `#company-${group.companyId}`,
      name,
      qual,
      count: group.count,
    };
  });
}

export function CompanyJumpNav({ groups }: { groups: JumpCompanyInput[] }) {
  const items = buildCompanyJumpItems(groups);
  if (items.length === 0) return null;
  return (
    <nav aria-label="会社別ジャンプ" className="mb-5">
      <details>
        <summary className="cursor-pointer py-1.5 text-[13px] leading-normal text-muted-foreground">
          会社から探す
          <span className="ml-2 font-mono text-[11px]">{items.length} 社</span>
        </summary>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-baseline gap-1.5 whitespace-nowrap rounded border border-border-strong bg-card px-2.5 py-2 text-[13px] leading-normal text-foreground hover:border-primary hover:text-accent-text"
            >
              <span>{item.name}</span>
              {item.qual ? <span className="font-mono text-[11px] text-muted-foreground">{item.qual}</span> : null}
              <span className="font-mono text-[11px] text-muted-foreground">{item.count}</span>
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
}
