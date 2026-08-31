'use client';

import type { ProjectItem, StatsBlockData } from '@/db/blocks';
import { resolveDisplayedStats } from '@/db/derived-display';

interface StatRowProps {
  data: StatsBlockData;
  projectItems?: ProjectItem[];
}

export const StatRow = ({ data, projectItems = [] }: StatRowProps) => {
  if (data.items.length === 0) return null;
  const items = resolveDisplayedStats(data.items, projectItems);
  const desktopColumns = items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4';

  return (
    // gap-px + 親の bg-border で 1px のヘアライン格子を作る（console は影を使わない）。
    // mb-6 は親が space-y-* を持つダッシュボードでは隣接兄弟マージンとして相殺されるため
    // 二重には空かない。逆に外すと space-y-0 のレイアウト（project ブロックが無いシート）で
    // 次ブロックとの余白が消えるので、ブレークポイントを付けず常に持たせる。
    <div className="overflow-x-auto">
      <div className={`mb-6 grid min-w-[360px] grid-cols-2 gap-px border border-border bg-border ${desktopColumns}`}>
        {items.map((item, i) => (
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
    </div>
  );
};
