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
    <div className="relative rounded-[var(--radius-lg)] border border-border bg-card p-7 pl-[26px] shadow-elevation-1">
      <div className="absolute bottom-7 left-[6px] top-7 w-0.5 bg-border" />
      {/* sm 以上は subgrid で日付＋稼働月数の列幅を全行で揃える。
          fit-content で最長ラベル幅（上限 280px）の全行共有 1 トラックになり、
          全タイトルの左端が一致する。minmax(0,280px) だと空きがあれば常に
          280px まで伸びて短いラベルの行に空白が残るため使わない（#393）。 */}
      <div className="flex flex-col gap-y-[18px] sm:grid sm:grid-cols-[fit-content(280px)_minmax(0,1fr)] sm:gap-x-4">
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
            // 320px では日付を独立行に落とす（#150）。sm 以上は親グリッドの
            // 2 列を subgrid で引き継ぎ、日付列とタイトル列を揃える。
            // 行の縦間隔は gap-y-1 だけ。column-gap を行側に置くと subgrid の
            // 溝幅（親の sm:gap-x-4）を上書きして日付とタイトルが詰まる（#393）。
            <div
              key={item.id}
              className="relative flex flex-col gap-y-1 sm:col-span-2 sm:grid sm:grid-cols-subgrid sm:items-baseline"
            >
              <span
                className={`absolute -left-[26px] top-[5px] size-3.5 rounded-full border-2 ${
                  hit ? 'border-primary bg-primary' : 'border-border bg-card'
                }`}
              />
              <span className="min-w-0 break-words font-mono text-[12px] text-accent-text">
                {periodDisplay || '(期間未入力)'}
                {duration && <span className="text-faint">（{duration}）</span>}
              </span>
              <div className="min-w-0">
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
          );
        })}
      </div>
    </div>
  );
}
