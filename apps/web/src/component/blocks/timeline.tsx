'use client';

import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { flattenTech, formatPeriodDisplay, sortByStartDesc } from '@skillsheet/db/process';
import { projectAreaLabel } from '@skillsheet/db/tech-area';
import { sanitizeHtml } from '@/util/sanitize-html';

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
    // design: カードで包み、レールを left:6px / 幅2px、項目間 18px にする。
    <div className="relative rounded-[var(--radius-lg)] border border-border bg-card p-7 pl-[26px]">
      <div className="absolute bottom-7 left-[6px] top-7 w-0.5 bg-border" />
      <div className="flex flex-col gap-[18px]">
        {sorted.map((item) => {
          const tech = flattenTech(item.tech);
          const hit = activeTech.length > 0 && tech.some((t) => activeTech.includes(t));
          const company = companyMap.get(item.companyId);
          return (
            <div key={item.id} className="relative">
              <span
                className={`absolute -left-[26px] top-[5px] size-3.5 rounded-full border-2 ${
                  hit ? 'border-primary bg-primary' : 'border-border bg-card'
                }`}
              />
              {/* 320px では日付列 min-w-[132px] がタイトル列を圧迫し5〜6行に断片化していた（#150）。
                  狭幅は日付を独立行に落とし、sm 以上でのみ従来どおり横並びにする。 */}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="font-mono text-[11.5px] text-accent-text sm:min-w-[132px]">
                  {formatPeriodDisplay(item.period) || '(期間未入力)'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold text-foreground">
                    {sanitizeHtml(item.title) || '(タイトル未入力)'}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      sanitizeHtml(company?.name),
                      sanitizeHtml(item.role),
                      sanitizeHtml(projectAreaLabel(item.scope, item.tech)),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
