'use client';

import type { StatsBlockData } from '@skillsheet/db/blocks';

interface StatRowProps {
  data: StatsBlockData;
}

export const StatRow = ({ data }: StatRowProps) => {
  if (data.items.length === 0) return null;

  return (
    <div className="mb-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
      {data.items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
        <div key={i} className="flex flex-col items-center justify-center bg-card px-4 py-5 text-center">
          <span className="text-3xl font-bold tabular-nums text-primary">
            {item.value}
            <span className="ml-0.5 text-base font-medium">{item.unit}</span>
          </span>
          <span className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};
