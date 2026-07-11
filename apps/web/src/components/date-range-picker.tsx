'use client';

import { hasPeriodRangeSeparator, splitPeriodRange } from '@skillsheet/db/process';
import { DateTokenPicker } from './date-token-picker';

interface DateRangePickerProps {
  /** "2020-04-15〜2023-03-20" 等の period 文字列 */
  value: string;
  onChange: (nextPeriod: string) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [startToken, endToken] = splitPeriodRange(value);
  // 元の period が区切り文字を持たない単一トークン（例: "2020"）かどうか。
  // 単一トークンを開始日側だけ編集しても、勝手に開放範囲へ変換しないための判定に使う。
  const hasSeparator = hasPeriodRangeSeparator(value);

  function handleStartChange(next: string) {
    if (!hasSeparator && !endToken) {
      // 元々単一トークンで終了側も未入力なら、単一トークンのまま維持する
      onChange(next);
      return;
    }
    // 区切り文字を 〜 で統一して結合
    onChange(`${next}〜${endToken}`);
  }

  function handleEndChange(next: string) {
    // 終了側を明示的に編集した時点で範囲として扱う（endToken が空＝現在でも区切りは残す）
    onChange(`${startToken}〜${next}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <DateTokenPicker value={startToken} onChange={handleStartChange} placeholder="開始年月日" />
      <span className="text-muted-foreground text-xs">〜</span>
      <DateTokenPicker value={endToken} onChange={handleEndChange} placeholder="終了年月日" allowPresent />
    </div>
  );
}
