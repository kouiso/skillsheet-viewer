'use client';

import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { flattenTech, sortByStartDesc } from '@skillsheet/db/process';

interface TimelineProps {
  items: ProjectItem[];
  companyMap: Map<string, CompanyInfo>;
  activeTech: string[];
}

// 案件タイムライン。start（period から導出）降順の縦レール表示。
// activeTech に該当する技術を含む案件はノード・ラベルをハイライトする。
export function Timeline({ items, companyMap, activeTech }: TimelineProps) {
  if (items.length === 0) return null;
  const sorted = sortByStartDesc(items, (item) => item.period);

  return (
    <div className="relative pl-6">
      <div className="absolute bottom-1.5 left-1.5 top-1.5 w-0.5 bg-border" />
      <div className="flex flex-col gap-4">
        {sorted.map((item) => {
          const tech = flattenTech(item.tech);
          const hit = activeTech.length > 0 && tech.some((t) => activeTech.includes(t));
          const company = companyMap.get(item.companyId);
          return (
            <div key={item.id} className="relative">
              <span
                className={`absolute -left-6 top-1 size-3.5 -translate-x-px rounded-full border-2 ${
                  hit ? 'border-primary bg-primary' : 'border-border bg-card'
                }`}
              />
              <div className="flex flex-wrap items-baseline gap-4">
                <span className="min-w-[132px] font-mono text-[11.5px] text-accent-text">
                  {item.period || '(期間未入力)'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold text-foreground">{item.title || '(タイトル未入力)'}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[company?.name, item.role, item.scope].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
