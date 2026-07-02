'use client';

interface TechFilterProps {
  all: string[];
  active: string[];
  query: string;
  onQueryChange: (query: string) => void;
  onToggle: (tech: string) => void;
  onClear: () => void;
  count: number;
  total: number;
}

// 技術チップの検索フィルタ。チップはトグルでOR条件、検索欄は案件・技術・役割を横断検索する。
export function TechFilter({ all, active, query, onQueryChange, onToggle, onClear, count, total }: TechFilterProps) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">⌕</span>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="案件・技術・役割を検索…"
            className="w-full rounded-[var(--radius)] border border-border bg-surface2 py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          <b className="text-accent-text">{count}</b> / {total} 件
        </span>
        {(active.length > 0 || query.length > 0) && (
          <button type="button" onClick={onClear} className="chip">
            クリア
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {all.map((tech) => (
          <button
            key={tech}
            type="button"
            onClick={() => onToggle(tech)}
            className={`chip ${active.includes(tech) ? 'on' : ''}`}
          >
            {tech}
          </button>
        ))}
      </div>
    </div>
  );
}
