'use client';

import { splitPeriodRange } from '@skillsheet/db/process';
import { DateTokenPicker } from './date-token-picker';

interface DateRangePickerProps {
  /** "2020-04-15〜2023-03-20" 等の period 文字列 */
  value: string;
  onChange: (nextPeriod: string) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [startToken, endToken] = splitPeriodRange(value);

  function handleStartChange(next: string) {
    // 区切り文字を 〜 で統一して結合
    onChange(`${next}〜${endToken}`);
  }

  function handleEndChange(next: string) {
    // endToken が空（現在）でも区切りは残す
    onChange(`${startToken}〜${next}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <DateTokenPicker
        value={startToken}
        onChange={handleStartChange}
        placeholder="開始年月日"
      />
      <span className="text-muted-foreground text-xs">〜</span>
      <DateTokenPicker
        value={endToken}
        onChange={handleEndChange}
        placeholder="終了年月日"
        allowPresent
      />
    </div>
  );
}
