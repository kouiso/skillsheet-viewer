'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/component/ui/button';
import { Input } from '@/component/ui/input';
import type { StatItem, StatsBlockData } from '@/db/block';

const FIELDS = [
  { key: 'value', label: '数値' },
  { key: 'unit', label: '単位' },
  { key: 'label', label: 'ラベル' },
] as const;

export function StatsBlockEditor({
  data,
  onChange,
}: {
  data: StatsBlockData;
  onChange: (data: StatsBlockData) => void;
}) {
  const editorId = useId();
  const update = (index: number, key: keyof StatItem, value: string) =>
    onChange({ ...data, items: data.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)) });

  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div
        className="hidden grid-cols-[6rem_5rem_minmax(0,1fr)_2.75rem] gap-3 text-sm font-medium text-muted-foreground sm:grid"
        aria-hidden="true"
      >
        <span>数値</span>
        <span>単位</span>
        <span>ラベル</span>
        <span />
      </div>
      {data.items.map((item, index) => (
        <fieldset
          // biome-ignore lint/suspicious/noArrayIndexKey: 既存保存形式の統計項目は順序で管理し ID を持たない
          key={index}
          className="grid min-w-0 grid-cols-2 gap-3 rounded-md border border-border p-3 sm:grid-cols-[6rem_5rem_minmax(0,1fr)_2.75rem] sm:border-0 sm:p-0"
        >
          <legend className="sr-only">統計項目{index + 1}</legend>
          {FIELDS.map(({ key, label }) => (
            <label
              key={key}
              htmlFor={`${editorId}-${index}-${key}`}
              className={`min-w-0 space-y-1 text-sm ${key === 'label' ? 'col-span-2 sm:col-span-1' : ''}`}
            >
              <span className="sm:sr-only">{label}</span>
              {/* 数値も文字列で保存する。小数・範囲・「以上」等の既存値を数値変換で失わない。 */}
              <Input
                id={`${editorId}-${index}-${key}`}
                value={item[key]}
                onChange={(event) => update(index, key, event.target.value)}
                aria-label={`統計項目${index + 1}の${label}`}
                className={`min-h-11 w-full min-w-0 ${key === 'value' ? 'font-mono' : ''}`}
              />
            </label>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-muted-foreground hover:text-destructive"
            aria-label={`統計項目${index + 1}を削除`}
            onClick={() => onChange({ ...data, items: data.items.filter((_, i) => i !== index) })}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </fieldset>
      ))}
      {data.items.length === 0 && (
        <p className="text-sm text-muted-foreground">統計項目がありません。項目を追加してください。</p>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange({ ...data, items: [...data.items, { value: '', unit: '', label: '' }] })}
      >
        <Plus className="size-4" aria-hidden="true" />
        項目を追加
      </Button>
    </div>
  );
}
