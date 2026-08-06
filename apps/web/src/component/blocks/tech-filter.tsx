'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface TechCount {
  name: string;
  /** その技術を使った案件数。 */
  count: number;
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

// 1案件でしか使っていない技術は既定で畳む閾値。実データでは 258 種中 149 種がこれに該当し、
// 全部並べると案件カードが画面外へ押し出される（design 本体は 91 種でしか検証されていない）。
const COMMON_MIN_COUNT = 2;

// 技術チップの検索フィルタ。チップはトグルでOR条件、検索欄は案件・技術・役割を横断検索する。
export function TechFilter({ all, active, query, onQueryChange, onToggle, onClear, count, total }: TechFilterProps) {
  const [showAll, setShowAll] = useState(false);

  // 選択中のチップは、たとえ1案件のみの技術でも隠さない（選択が視界から消えると解除できない）。
  const shown = useMemo(() => {
    if (showAll) return all;
    const activeSet = new Set(active);
    return all.filter((t) => t.count >= COMMON_MIN_COUNT || activeSet.has(t.name));
  }, [all, active, showAll]);

  // 選択中のチップは 1 案件だけの技術でも隠さないので、共通タグの数から引くとズレる。
  // 実際に描画している数との差で数える。
  const hiddenCount = all.length - shown.length;

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
        {/* クリアは値の選択ではなく操作なので .chip ではなく .softbtn。 */}
        {(active.length > 0 || query.length > 0) && (
          <button type="button" onClick={onClear} className="softbtn compact">
            クリア
          </button>
        )}
      </div>

      {/* 既定は約3行で頭打ちにし、下端のグラデーションで「まだ続く」ことを示す。 */}
      <div className={showAll ? 'relative' : 'relative max-h-[146px] overflow-hidden'}>
        {!showAll && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[34px] bg-gradient-to-b from-transparent to-background"
          />
        )}
        <div className="flex flex-wrap gap-[7px]">
          {shown.map((tech) => (
            <button
              key={tech.name}
              type="button"
              onClick={() => onToggle(tech.name)}
              aria-pressed={active.includes(tech.name)}
              title={`${tech.name}（${tech.count}件）`}
              className={`chip max-w-[220px] gap-1.5 ${active.includes(tech.name) ? 'on' : ''}`}
            >
              <span className="overflow-hidden text-ellipsis">{tech.name}</span>
              <span className={`text-[10px] ${active.includes(tech.name) ? 'opacity-70' : 'text-faint'}`}>
                {tech.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => setShowAll((v) => !v)} className="softbtn compact">
          {showAll ? '折りたたむ' : 'すべての技術を表示'}
          {!showAll && hiddenCount > 0 && <span className="font-mono text-[11px] text-faint">+{hiddenCount}</span>}
        </button>
        {!showAll && hiddenCount > 0 && (
          <span className="font-mono text-[10.5px] text-faint">
            1案件のみで使った技術は隠しています（検索欄では全件ヒットします）
          </span>
        )}
      </div>
    </div>
  );
}
