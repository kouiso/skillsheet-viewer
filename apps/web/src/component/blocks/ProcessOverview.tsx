'use client';

import type { ProjectItem } from '@skillsheet/db/blocks';
import { normalizeProcess, PROCESS_LABELS } from '@skillsheet/db/process';

interface ProcessOverviewProps {
  items: ProjectItem[];
}

const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// 全案件の工程カバレッジを7つのドーナツで俯瞰する。
// カウント対象は done のみ（uncertain は集計に含めない＝実績を確実な分だけ数える）。
export function ProcessOverview({ items }: ProcessOverviewProps) {
  const total = items.length;
  if (total === 0) return null;

  const normalized = items.map((item) => normalizeProcess(item.process));

  return (
    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
      {PROCESS_LABELS.map((label, i) => {
        const doneCount = normalized.filter((n) => n.done[i]).length;
        const uncertainCount = normalized.filter((n) => n.uncertain[i]).length;
        const ratio = doneCount / total;
        return (
          <div
            key={label}
            className="flex flex-col items-center gap-2.5 rounded-[var(--radius-lg)] border border-border bg-card px-3 py-4 text-center"
          >
            <span className="min-h-[30px] text-[11.5px] leading-tight text-muted-foreground">{label}</span>
            <div className="relative size-[46px]">
              <svg viewBox="0 0 46 46" className="-rotate-90" aria-hidden="true">
                <circle cx="23" cy="23" r={RADIUS} fill="none" stroke="var(--track)" strokeWidth="5" />
                <circle
                  cx="23"
                  cy="23"
                  r={RADIUS}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${ratio * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                />
              </svg>
              <span className="absolute inset-0 grid place-items-center font-mono text-xs font-semibold text-foreground">
                {doneCount}
              </span>
            </div>
            <span className="font-mono text-[10px] text-faint">/{total}</span>
            {uncertainCount > 0 && <span className="font-mono text-[10px] text-faint">確認中 {uncertainCount}件</span>}
          </div>
        );
      })}
    </div>
  );
}
