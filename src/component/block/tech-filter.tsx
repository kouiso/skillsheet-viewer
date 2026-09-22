'use client';

import { Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { ProjectTech } from '@/db/block';
import { TECH_BUCKET_LABELS, TECH_BUCKET_ORDER } from '@/db/process';
import { parseProjectQuery, SEARCH_HINT_AND, SEARCH_HINT_OR } from './project-search';

export interface TechCount {
  name: string;
  /** その技術を使った案件数。 */
  count: number;
  /** 候補リストでグルーピング見出しに使う分類バケット。 */
  bucket: keyof ProjectTech;
}

interface TechFilterProps {
  all: TechCount[];
  active: string[];
  query: string;
  onQueryChange: (query: string) => void;
  onToggle: (tech: string) => void;
  onClear: () => void;
  count: number;
  total: number;
}

const SUGGESTION_LIMIT = 40;

// 案件テキスト検索と、技術の検索選択は別コントロール。チップ雲は出さない。
export function TechFilter({ all, active, query, onQueryChange, onToggle, onClear, count, total }: TechFilterProps) {
  const [techQuery, setTechQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  // combobox は入力と listbox を id で結び、いま矢印キーで選んでいる option を
  // aria-activedescendant で指し示さないと、スクリーンリーダーが移動先を読み上げられない。
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const activeSet = useMemo(() => new Set(active), [active]);
  const selected = useMemo(() => all.filter((t) => activeSet.has(t.name)), [all, activeSet]);
  const searchHint = parseProjectQuery(query).requireAll ? SEARCH_HINT_AND : SEARCH_HINT_OR;

  const q = techQuery.trim().toLowerCase();
  const matches = useMemo(
    () =>
      all.filter((t) => !activeSet.has(t.name) && (!q || t.name.toLowerCase().includes(q))).slice(0, SUGGESTION_LIMIT),
    [all, activeSet, q],
  );

  // 言語・インフラ・ツールが無分類で並ぶと「何が技術扱いか」が読み取れないため、
  // 案件カードと同じバケットラベルの見出しで候補をグルーピングする（#314）。
  // index はフラットな matches 上の位置のまま保持し、aria-activedescendant と
  // 矢印キー移動がグループをまたいで崩れないようにする。
  const groups = useMemo(() => {
    const byBucket = new Map<keyof ProjectTech, { tech: TechCount; index: number }[]>();
    matches.forEach((tech, index) => {
      const list = byBucket.get(tech.bucket);
      if (list) {
        list.push({ tech, index });
      } else {
        byBucket.set(tech.bucket, [{ tech, index }]);
      }
    });
    // グループの並びは TECH_BUCKET_ORDER 固定。件数順にすると絞り込みのたびに
    // 見出しの位置が入れ替わり、目印として使えない。
    return TECH_BUCKET_ORDER.filter((bucket) => byBucket.has(bucket)).map((bucket) => ({
      bucket,
      label: TECH_BUCKET_LABELS[bucket],
      items: byBucket.get(bucket) ?? [],
    }));
  }, [matches]);

  const pick = (name: string) => {
    onToggle(name);
    setTechQuery('');
    setHi(-1);
    // 選んだ直後に見たいのは絞り込まれた案件カード。開いたままだと候補パネルが
    // その結果を覆い隠し、毎回クリックか Escape で閉じる操作を強いていた。
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          {/* U+2315（テキストグリフ）だけ lucide の SVG アイコン群と質感が揃わず、
              aria-hidden も無かった（#152 S-5）。 */}
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="案件・技術・役割を検索…"
            aria-label="案件・技術・役割を検索"
            // outline-none で UA 既定のフォーカスリングを消したあと、それに代わるリング指定が
            // 無く、枠線色の変化（focus:border-primary）だけになっていた（#156）。
            // focus-visible:ring-2 を追加してキーボード操作時にリングが見えるようにする。
            // placeholder の色指定が無いと UA 既定（currentColor 50%）にフォールバックし、
            // ライトテーマで 3.35:1（WCAG AA 未達）になっていた（#152 S-4）。
            className="min-h-11 w-full rounded-[var(--radius)] border border-border bg-surface2 py-[9px] pl-[30px] pr-3 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          <b className="text-accent-text">{count}</b> / {total} 件
        </span>
        {(active.length > 0 || query.length > 0) && (
          <button type="button" onClick={onClear} className="softbtn compact">
            クリア
          </button>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{searchHint}</p>

      <div className="relative min-w-[220px] max-w-[420px]">
        <input
          value={techQuery}
          role="combobox"
          aria-label="技術を選ぶ"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={open && hi >= 0 && matches[hi] ? optionId(hi) : undefined}
          placeholder="技術を選ぶ…"
          onChange={(e) => {
            setTechQuery(e.target.value);
            setOpen(true);
            setHi(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'ArrowDown' && matches.length > 0) {
              e.preventDefault();
              setOpen(true);
              setHi((hi + 1 + matches.length) % matches.length);
            } else if (e.key === 'ArrowUp' && matches.length > 0) {
              e.preventDefault();
              setOpen(true);
              // 未選択は hi = -1。素直に剰余を取ると (-1-1+n)%n = n-2 で末尾から
              // 2番目が選ばれる。WAI-ARIA の combobox は未選択からの ↑ で末尾へ行く。
              setHi(hi < 0 ? matches.length - 1 : (hi - 1 + matches.length) % matches.length);
            } else if (e.key === 'Escape') {
              setOpen(false);
              setHi(-1);
            } else if (e.key === 'Enter' && open && hi >= 0 && matches[hi]) {
              e.preventDefault();
              pick(matches[hi].name);
            }
          }}
          onBlur={() => {
            setOpen(false);
            setHi(-1);
          }}
          className="min-h-11 w-full rounded-[var(--radius)] border border-border bg-surface2 py-[9px] px-3 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        {open && matches.length > 0 && (
          <div
            role="listbox"
            id={listboxId}
            aria-label="技術の候補"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius)] border border-border bg-card py-1 shadow-md"
          >
            {groups.map((group) => (
              // biome-ignore lint/a11y/useSemanticElements: listbox 内の optgroup 相当の分類には role="group" が正しい。fieldset はフォーム部品で option のコンテナとして不適切
              <div key={group.bucket} role="group" aria-label={group.label}>
                {/* 見出しは視覚用。スクリーンリーダーには group の aria-label で伝え、二重読み上げを避ける。 */}
                <div aria-hidden="true" className="px-3 pb-0.5 pt-2 text-[12px] font-medium text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map(({ tech, index }) => (
                  <button
                    key={tech.name}
                    id={optionId(index)}
                    type="button"
                    role="option"
                    aria-selected={index === hi}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] ${
                      index === hi ? 'bg-accent-soft text-accent-text' : 'text-foreground'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(tech.name);
                    }}
                    onMouseEnter={() => setHi(index)}
                  >
                    <span>{tech.name}</span>
                    <span className="font-mono text-[12px] text-muted-foreground">{tech.count}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-[7px]">
          {selected.map((tech) => (
            <button
              key={tech.name}
              type="button"
              onClick={() => onToggle(tech.name)}
              aria-pressed="true"
              title={`${tech.name}（${tech.count}件）`}
              className="chip max-w-[220px] gap-1.5 on"
            >
              <span className="overflow-hidden text-ellipsis">{tech.name}</span>
              <span className="text-[12px]">{tech.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
