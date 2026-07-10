'use client';

import { CalendarIcon } from 'lucide-react';

import { formatMonthToken, parseTokenToDate, serializeDateToken } from '@skillsheet/db/process';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateTokenPickerProps {
  /** 現在の生文字列トークン（"2020-04-15" / "2020.04" / "現在" / "" 等） */
  value: string;
  onChange: (nextToken: string) => void;
  placeholder: string;
  /** true の場合、「現在」ボタンを表示し、選択で value を "" に設定する（endDate 用） */
  allowPresent?: boolean;
}

export function DateTokenPicker({ value, onChange, placeholder, allowPresent }: DateTokenPickerProps) {
  const isPresent = allowPresent && !value;
  const displayLabel = value
    ? formatMonthToken(value)
    : allowPresent
      ? '現在'
      : placeholder;

  const selected = parseTokenToDate(value);

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    onChange(serializeDateToken(date));
  }

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 justify-start gap-1.5 text-left font-normal',
              !value && !isPresent && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{displayLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected ?? new Date()}
          />
        </PopoverContent>
      </Popover>
      {allowPresent && !isPresent && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => onChange('')}
        >
          現在
        </Button>
      )}
    </div>
  );
}
