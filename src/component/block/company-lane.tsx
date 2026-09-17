'use client';

import { formatMonthToken, type PeriodBounds, parsePeriodBounds, splitPeriodRange } from '@/db/process';

export interface LaneItem {
  no: string;
  period: string;
  duration: string;
}

export interface LaneRow {
  no: string;
  left: string;
  width: string;
  duration: string;
}

export function buildCompanyLane(
  companyPeriod: string,
  items: LaneItem[],
): { startLabel: string; endLabel: string; rows: LaneRow[] } | null {
  const bounds = parsePeriodBounds(companyPeriod);
  if (!bounds) return null;
  // 期間を解釈できない案件はレーンに出さない。以前は会社の期間へフォールバックしており、
  // 期間「不明」の案件が在籍期間いっぱいのバーになって、ずっと在籍したように見えていた。
  const parsed = items
    .map((item) => ({ item, itemBounds: parsePeriodBounds(item.period) }))
    .filter((row): row is { item: LaneItem; itemBounds: PeriodBounds } => row.itemBounds !== null);
  if (parsed.length < 2) return null;
  const startM = Math.round(bounds.start * 12);
  // 終端「現在」は実行時点の月なので、サーバとブラウザで月をまたぐと幅が変わる（hydration ずれ）。
  // 描画に使う終端は案件側の最大値から決めて、時計を描画から外す。
  const itemEndM = Math.max(...parsed.map((row) => Math.round(row.itemBounds.end * 12)));
  const endM = bounds.openEnded ? Math.max(itemEndM, startM) : Math.round(bounds.end * 12);
  const total = endM - startM + 1;
  if (total <= 0) return null;
  const [startToken, endToken] = splitPeriodRange(companyPeriod);
  const startLabel = formatMonthToken(startToken);
  const endLabel = endToken ? formatMonthToken(endToken) : startLabel;
  const rows = parsed.map(({ item, itemBounds }) => {
    const s = Math.max(Math.round(itemBounds.start * 12), startM);
    const e = Math.min(Math.max(Math.round(itemBounds.end * 12), s), endM);
    const left = ((s - startM) / total) * 100;
    const width = Math.max(((e - s + 1) / total) * 100, 4);
    return {
      no: item.no,
      left: `${left.toFixed(2)}%`,
      width: `${Math.min(width, 100 - left).toFixed(2)}%`,
      duration: item.duration,
    };
  });
  return { startLabel, endLabel, rows };
}

export function CompanyLane({ companyPeriod, items }: { companyPeriod: string; items: LaneItem[] }) {
  const lane = buildCompanyLane(companyPeriod, items);
  if (!lane) return null;
  return (
    <div className="flex max-w-full min-w-0 flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-1.5">
        {lane.rows.map((row) => (
          <div
            key={row.no}
            className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2.5 sm:grid-cols-[30px_minmax(0,1fr)_auto]"
          >
            <span className="font-mono text-[11px] leading-none text-accent-text">{row.no}</span>
            <div className="relative h-2.5 rounded-full bg-chip-bg">
              <div
                className="absolute inset-y-0 rounded-full bg-primary-dark"
                style={{ left: row.left, width: row.width }}
              />
            </div>
            <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{row.duration}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[26px_minmax(0,1fr)_auto] gap-2.5 sm:grid-cols-[30px_minmax(0,1fr)_auto]">
        <span aria-hidden />
        <div className="flex justify-between gap-2.5 border-t border-border pt-1.5">
          <span className="font-mono text-[11px] text-muted-foreground">{lane.startLabel}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{lane.endLabel}</span>
        </div>
        <span aria-hidden />
      </div>
    </div>
  );
}
