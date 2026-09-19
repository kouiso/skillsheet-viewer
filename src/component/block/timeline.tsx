'use client';

import type { CompanyInfo, ProjectItem } from '@/db/block';
import { resolveDuration } from '@/db/duration';
import { flattenTech, formatPeriodDisplay, sortByStartDesc } from '@/db/process';
import { sanitizeHtml } from '@/db/sanitize-html';
import { resolveProjectArea } from '@/db/tech-area';

interface TimelineProps {
  items: ProjectItem[];
  companyMap: Map<string, CompanyInfo>;
  activeTech: string[];
  /** 稼働月数（期間の右の括弧書き）を出すか。ビュートグル「稼働月数」に従う。既定 true。 */
  showDuration?: boolean;
  /** 「現在」終端の導出に使う固定基準月。サーバが読取時に決めた値を渡す。 */
  referenceMonth?: number;
}

function timelineArea(item: ProjectItem): string {
  const area = resolveProjectArea(item.scope, item.tech);
  if (!area.text) return '';
  return area.derived ? `技術領域 ${sanitizeHtml(area.text)}` : sanitizeHtml(area.text);
}

// 案件タイムライン。start（period から導出）降順の縦レール表示。
// activeTech に該当する技術を含む案件はノード・ラベルをハイライトする。
export function Timeline({ items, companyMap, activeTech, showDuration = true, referenceMonth }: TimelineProps) {
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
          const periodDisplay = formatPeriodDisplay(item.period);
          // 案件カード（project-card.tsx）と同じ「期間（稼働月数）」の表記に揃える。
          // カード側は期間の有無を見ず showDuration だけで出す — period が空でも
          // 手入力 duration があれば '9ヶ月' と表示されるので、ここも同じ条件にする（#354）。
          const duration = showDuration
            ? sanitizeHtml(resolveDuration(item.period, item.duration, referenceMonth).label)
            : '';
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
                <span className="font-mono text-[12px] text-accent-text sm:min-w-[132px]">
                  {periodDisplay || '(期間未入力)'}
                  {duration && <span className="text-faint">（{duration}）</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold text-foreground">
                    {sanitizeHtml(item.title) || '(タイトル未入力)'}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {/* 役割の隣に無ラベルで並べると担当領域として読まれるため、
                        導出値のときだけ「技術領域」を前置する（tech-area.ts 参照）。 */}
                    {[sanitizeHtml(company?.name), sanitizeHtml(item.role), timelineArea(item)]
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
