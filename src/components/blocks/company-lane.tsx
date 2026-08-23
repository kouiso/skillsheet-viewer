'use client';

import { formatMonthToken, parsePeriodBounds, splitPeriodRange } from '@/db/process';

interface LaneItem {
  /** 表示用の通し番号（カードの番号バッジと同じ値）。 */
  no: number;
  period: string;
  /** 表示用の期間の長さ（例: "3ヶ月"）。無ければ帯にラベルを出さない。 */
  duration: string;
}

interface CompanyLaneProps {
  /** 会社の在籍期間。パースできなければ何も描画しない。 */
  companyPeriod: string;
  items: LaneItem[];
}

// 1ヶ月に満たない案件でも「そこに何かある」と分かる最小幅。
const MIN_SEGMENT_WIDTH = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 会社の在籍期間を 100% とした帯に、配下の案件を区間として配置するレーン図。
 * 「同じ会社の中での案件の重なり・順番」を文章で説明せず図で見せる
 * （プラン: 個人開発には付けない／案件が1件では意味が無い、は呼び出し側の isMulti 判定に委ねる）。
 *
 * 装飾目的の可視化であり、内容は上のカード一覧に numは同じ番号で既に文字で出ているため、
 * レーン自体は aria-hidden にしてスクリーンリーダーの読み上げ対象から外す。
 */
export function CompanyLane({ companyPeriod, items }: CompanyLaneProps) {
  const bounds = parsePeriodBounds(companyPeriod);
  if (!bounds) return null;
  const total = bounds.end - bounds.start;
  if (total <= 0) return null;

  const segments = items.map((item) => {
    const itemBounds = parsePeriodBounds(item.period);
    // 期間が読めない案件に会社の在籍期間を代入すると「在籍期間まるごと担当した」と
    // 読める帯になってしまう。読めないものは帯を描かず、番号と長さだけ残す。
    if (!itemBounds) return { no: item.no, duration: item.duration, bar: null };

    // start も会社期間の終端で止める。ここを止めないと、会社期間の外から始まる案件
    // （データ入力ミスや、退職後も続いた案件）で end < start となり width が負になり、
    // width: "-43.48%" という不正な CSS が出て帯が消える。
    const start = clamp(itemBounds.start, bounds.start, bounds.end);
    const end = clamp(itemBounds.end, start, bounds.end);
    const width = Math.min(Math.max(((end - start) / total) * 100, MIN_SEGMENT_WIDTH), 100);
    // 最小幅を足したぶん右にはみ出さないよう left 側を戻す。
    const left = Math.min(((start - bounds.start) / total) * 100, 100 - width);
    return { no: item.no, duration: item.duration, bar: { left, width } };
  });

  const [startToken, endToken] = splitPeriodRange(companyPeriod);
  const laneStart = formatMonthToken(startToken);
  const laneEnd = endToken ? formatMonthToken(endToken) : '現在';

  return (
    <div
      aria-hidden="true"
      className="flex max-w-[var(--measure,72ch)] flex-col gap-1.5 rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3"
    >
      <div className="flex flex-col gap-1.5">
        {segments.map((seg) => (
          <div
            key={seg.no}
            className="grid grid-cols-[26px_1fr_auto] items-center gap-2.5 sm:grid-cols-[30px_1fr_auto]"
          >
            <span className="font-mono text-[11px] text-accent-text">{String(seg.no).padStart(2, '0')}</span>
            <div className="relative h-2.5 rounded-full bg-chip-bg">
              {seg.bar && (
                <div
                  className="absolute inset-y-0 rounded-full bg-primary-dark"
                  style={{ left: `${seg.bar.left.toFixed(2)}%`, width: `${seg.bar.width.toFixed(2)}%` }}
                />
              )}
            </div>
            <span className="whitespace-nowrap font-mono text-[11px] text-faint">{seg.duration}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[26px_1fr_auto] gap-2.5 sm:grid-cols-[30px_1fr_auto]">
        <span />
        <div className="flex justify-between gap-2.5 border-t border-border pt-1">
          <span className="font-mono text-[11px] text-faint">{laneStart}</span>
          <span className="font-mono text-[11px] text-faint">{laneEnd}</span>
        </div>
        <span />
      </div>
    </div>
  );
}
