'use client';

import type { ProjectBlockData } from '@skillsheet/db/blocks';
import { flattenTech } from '@skillsheet/db/process';
import { useMemo, useState } from 'react';
import { ProcessOverview } from './ProcessOverview';
import { ProjectCard } from './ProjectCard';
import { SectionHead } from './SectionHead';
import { TechFilter } from './TechFilter';
import { Timeline } from './Timeline';

interface ProjectSectionProps {
  data: ProjectBlockData;
}

// project ブロックを「工程の俯瞰・案件詳細（技術フィルタ付き）・タイムライン」の
// 3セクションへ投影するダッシュボード。新ブロック型を増やさず、既存の project データの
// ビュー層としてのみ実装する。
export function ProjectSection({ data }: ProjectSectionProps) {
  const [query, setQuery] = useState('');
  const [activeTech, setActiveTech] = useState<string[]>([]);

  const companyMap = useMemo(() => new Map(data.companies.map((c) => [c.id, c])), [data.companies]);

  // no はフィルタ前の全件配列基準（絞り込んでも既存カードの番号は変わらない）。
  const itemsWithNo = useMemo(
    () => data.items.map((item, index) => ({ item, no: index + 1, tech: flattenTech(item.tech) })),
    [data.items],
  );

  // 出現頻度の降順（プロトタイプの allTech 並びに合わせる）。
  const allTech = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { tech } of itemsWithNo) {
      for (const t of tech) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [itemsWithNo]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return itemsWithNo.filter(({ item, tech }) => {
      const techOk = activeTech.length === 0 || tech.some((t) => activeTech.includes(t));
      if (!techOk) return false;
      if (!q) return true;
      const company = companyMap.get(item.companyId);
      const haystack = [item.title, item.scope, item.role, company?.name ?? '', item.summary ?? item.duties, ...tech]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [itemsWithNo, activeTech, query, companyMap]);

  const toggleTech = (t: string) => {
    setActiveTech((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };
  const clear = () => {
    setActiveTech([]);
    setQuery('');
  };

  if (data.items.length === 0 && data.companies.length === 0) return null;

  return (
    <div className="space-y-10">
      <section>
        <SectionHead kicker="Process Coverage" title="担当工程の俯瞰" />
        <ProcessOverview items={data.items} />
      </section>

      <section>
        <SectionHead kicker="Projects" title="案件詳細" />
        <div className="mb-5">
          <TechFilter
            all={allTech}
            active={activeTech}
            query={query}
            onQueryChange={setQuery}
            onToggle={toggleTech}
            onClear={clear}
            count={filtered.length}
            total={itemsWithNo.length}
          />
        </div>
        <div className="space-y-4">
          {filtered.map(({ item, no, tech }) => (
            <ProjectCard
              key={item.id}
              item={item}
              no={no}
              company={companyMap.get(item.companyId)}
              activeTech={activeTech}
              tech={tech}
            />
          ))}
          {filtered.length === 0 && (
            <p className="rounded border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              条件に一致する案件がありません
            </p>
          )}
        </div>
      </section>

      <section>
        <SectionHead kicker="Career Timeline" title="案件タイムライン" />
        <Timeline items={filtered.map((x) => x.item)} companyMap={companyMap} activeTech={activeTech} />
      </section>
    </div>
  );
}
