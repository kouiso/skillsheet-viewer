'use client';

import type { StatsBlockData } from '@skillsheet/db/blocks';

interface StatRowProps {
  data: StatsBlockData;
}

export const StatRow = ({ data }: StatRowProps) => {
  if (data.items.length === 0) return null;

  return (
    // gap-px + 親の bg-border で 1px のヘアライン格子を作る（console は影を使わない）。
    <div className="grid grid-cols-2 gap-px border border-border bg-border sm:mb-6 sm:grid-cols-4">
      {data.items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
        <div key={i} className="bg-card px-3 py-3.5 sm:px-4 sm:py-[18px]">
          <span className="font-mono text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground sm:text-[30px]">
            {item.value}
            <span className="ml-0.5 font-mono text-sm font-normal tracking-normal text-accent-text">{item.unit}</span>
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
};
