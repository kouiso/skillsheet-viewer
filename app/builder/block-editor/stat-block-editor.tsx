'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/component/ui/button';
import { Input } from '@/component/ui/input';
import type { StatItem, StatKind, StatsBlockData } from '@/db/block';
import type { MarkdownExperienceContext } from '@/db/block/serialize';
import { isStatComputed, resolveDisplayedStats, statKindOf } from '@/db/derived-display';

const FIELDS = [
  { key: 'value', label: '数値' },
  { key: 'unit', label: '単位' },
  { key: 'label', label: 'ラベル' },
] as const;

// 保存する種類の集合は変えない。「計算」は計算元が 2 つあるので種類をそのまま並べる。
const KIND_OPTIONS: readonly { value: StatKind; label: string }[] = [
  { value: 'experience', label: '計算（経験年数）' },
  { value: 'projectCount', label: '計算（案件数）' },
  { value: 'free', label: '自由' },
];

export function StatsBlockEditor({
  data,
  onChange,
  context,
}: {
  data: StatsBlockData;
  onChange: (data: StatsBlockData) => void;
  /**
   * 閲覧画面と同じ表示対象の案件。渡すと、計算される項目に今の値を出して読み取り専用にする。
   * 渡さない（案件ブロックが無いシート）と、閲覧画面・PDF と同じく保存値をそのまま出して編集できる。
   */
  context?: Pick<MarkdownExperienceContext, 'projects' | 'referenceMonth'>;
}) {
  const editorId = useId();
  const update = (index: number, key: Exclude<keyof StatItem, 'kind'>, value: string) =>
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
      {data.items.map((item, index) => {
        // 案件の出どころ（context）が無いと閲覧画面・PDF は計算せず保存値を出す。編集欄も同じにする。
        const computed = context !== undefined && isStatComputed(item);
        // 閲覧画面・PDF と同じ resolveDisplayedStats で出し、編集欄だけ別の計算をしない。
        const shownValue =
          computed && context
            ? (resolveDisplayedStats([item], context.projects, context.referenceMonth)[0]?.value ?? item.value)
            : item.value;
        const noteId = `${editorId}-${index}-auto`;
        return (
          <fieldset
            // biome-ignore lint/suspicious/noArrayIndexKey: 既存保存形式の統計項目は順序で管理し ID を持たない
            key={index}
            className="grid min-w-0 grid-cols-2 gap-3 rounded-md border border-border p-3 sm:grid-cols-[6rem_5rem_minmax(0,1fr)_2.75rem] sm:border-0 sm:p-0"
          >
            <legend className="sr-only">統計項目{index + 1}</legend>
            {FIELDS.map(({ key, label }) => {
              const readOnly = computed && key === 'value';
              return (
                <label
                  key={key}
                  htmlFor={`${editorId}-${index}-${key}`}
                  className={`min-w-0 space-y-1 text-sm ${key === 'label' ? 'col-span-2 sm:col-span-1' : ''}`}
                >
                  <span className="sm:sr-only">{label}</span>
                  {/* 数値も文字列で保存する。小数・範囲・「以上」等の既存値を数値変換で失わない。 */}
                  <Input
                    id={`${editorId}-${index}-${key}`}
                    value={readOnly ? shownValue : item[key]}
                    // 計算される数値は保存値を書き換えさせない（表示時に案件から出し直すため）。
                    {...(readOnly
                      ? { readOnly: true, 'aria-describedby': noteId }
                      : { onChange: (event) => update(index, key, event.target.value) })}
                    aria-label={`統計項目${index + 1}の${label}`}
                    className={`min-h-11 w-full min-w-0 ${key === 'value' ? 'font-mono' : ''} ${readOnly ? 'bg-muted text-muted-foreground' : ''}`}
                  />
                </label>
              );
            })}
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
            <label
              htmlFor={`${editorId}-${index}-kind`}
              className="col-span-2 flex min-w-0 items-center gap-3 text-sm sm:col-span-4"
            >
              <span className="shrink-0 text-muted-foreground">種類</span>
              <select
                id={`${editorId}-${index}-kind`}
                value={statKindOf(item)}
                onChange={(event) => {
                  const kind = KIND_OPTIONS.find((option) => option.value === event.target.value)?.value;
                  if (kind === undefined) return;
                  onChange({ ...data, items: data.items.map((it, i) => (i === index ? { ...it, kind } : it)) });
                }}
                aria-label={`統計項目${index + 1}の種類`}
                className="sel min-h-11 min-w-0 flex-1 sm:max-w-60"
              >
                {KIND_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {computed && (
              <p id={noteId} className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
                案件から自動で出します
              </p>
            )}
          </fieldset>
        );
      })}
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
