'use client';

import type { ProjectItem } from '@skillsheet/db/blocks';
import { normalizeProcess, PROCESS_LABELS } from '@skillsheet/db/process';
import { ProcessLabelParts } from './process-label';

interface ProcessOverviewProps {
  items: ProjectItem[];
}

const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// 全案件の工程カバレッジを7つのドーナツで俯瞰する。
export function ProcessOverview({ items }: ProcessOverviewProps) {
  const total = items.length;
  if (total === 0) return null;

  const normalized = items.map((item) => normalizeProcess(item.process));

  return (
    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
      {PROCESS_LABELS.map((label, i) => {
        const doneCount = normalized.filter((n) => n.done[i]).length;
        const ratio = doneCount / total;
        return (
          <div
            key={label}
            className="flex flex-col items-center gap-2.5 rounded-[var(--radius-lg)] border border-border bg-card px-3 py-4 text-center"
          >
            {/* 語中で折れて孤立1文字が残っていた問題（#152 S-5）。process-stepper.tsx と
                同じ break-keep + 「・」直後のみ <wbr /> で折り返す。 */}
            <span className="min-h-[30px] break-keep text-[11.5px] leading-tight text-muted-foreground">
              <ProcessLabelParts label={label} />
            </span>
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
                  // strokeLinecap="round" だと丸いキャップ分（strokeWidth / RADIUS ラジアン ≈
                  // 15.1°）だけ弧が実際の割合より長く見え、31/32 が満円（32/32）と区別できなく
                  // なっていた（#152 S-1）。butt（既定）にして正確な割合で描画する。
                  strokeDasharray={`${ratio * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                />
              </svg>
              <span className="absolute inset-0 grid place-items-center font-mono text-xs font-semibold text-foreground">
                {doneCount}
              </span>
            </div>
            <span className="font-mono text-[10px] text-faint">/{total}</span>
          </div>
        );
      })}
    </div>
  );
}
