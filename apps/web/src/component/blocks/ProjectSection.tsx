'use client';

import { filterVisibleProjectData, type ProjectBlockData } from '@skillsheet/db/blocks';
import { flattenTech } from '@skillsheet/db/process';
import { motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, useMemo, useState } from 'react';
import { ProcessOverview } from './ProcessOverview';
import { ProjectCard } from './ProjectCard';
import { SectionHead } from './SectionHead';
import { TechFilter } from './TechFilter';
import { Timeline } from './Timeline';

interface ProjectSectionProps {
  data: ProjectBlockData;
  /** 工程俯瞰セクションを表示するか（ビュートグル）。 */
  showProcess?: boolean;
  /** 案件詳細セクションを表示するか（ビュートグル）。 */
  showProjects?: boolean;
  /** タイムラインセクションを表示するか（ビュートグル）。 */
  showTimeline?: boolean;
}

// ビュートグルで再マウントされた際のフェードアップ（プロトタイプの .fadeup 相当）。
// prefers-reduced-motion 時は即時表示する。
function FadeUpSection({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.section>
  );
}

// project ブロックを「工程の俯瞰・案件詳細（技術フィルタ付き）・タイムライン」の
// 3セクションへ投影するダッシュボード。新ブロック型を増やさず、既存の project データの
// ビュー層としてのみ実装する。
export function ProjectSection({
  data,
  showProcess = true,
  showProjects = true,
  showTimeline = true,
}: ProjectSectionProps) {
  const [query, setQuery] = useState('');
  const [activeTech, setActiveTech] = useState<string[]>([]);

  // hidden な会社・案件の除外はここが唯一の入口。番号付け・TechFilter の件数・
  // ProcessOverview の集計・Timeline はすべてこのフィルタ済みデータから導出する
  // （PDF 側は projectBlockToMarkdown が同じ関数を適用しており表示が一致する）。
  const visible = useMemo(() => filterVisibleProjectData(data), [data]);

  const companyMap = useMemo(() => new Map(visible.companies.map((c) => [c.id, c])), [visible.companies]);

  // no は hidden 除外後の全件配列基準（技術・検索で絞り込んでも既存カードの番号は変わらない）。
  const itemsWithNo = useMemo(
    () => visible.items.map((item, index) => ({ item, no: index + 1, tech: flattenTech(item.tech) })),
    [visible.items],
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

  // 可視案件が0件なら（会社だけ残っていても）表示するものが無いため何も描画しない。
  if (visible.items.length === 0) return null;
  if (!showProcess && !showProjects && !showTimeline) return null;

  // 案件詳細セクション（フィルタUI）が非表示のときは、そのフィルタ状態を
  // タイムラインへ持ち込まない（消したい方法が無いまま案件が消えて見えるのを防ぐ）。
  const timelineItems = showProjects ? filtered.map((x) => x.item) : visible.items;
  const timelineActiveTech = showProjects ? activeTech : [];

  return (
    <div className="space-y-10">
      {showProcess && (
        <FadeUpSection key="process">
          <SectionHead kicker="Process Coverage" title="担当工程の俯瞰" />
          <ProcessOverview items={visible.items} />
        </FadeUpSection>
      )}

      {showProjects && (
        <FadeUpSection key="projects">
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
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(380px,100%),1fr))]">
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
              <p className="col-span-full rounded border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                条件に一致する案件がありません
              </p>
            )}
          </div>
        </FadeUpSection>
      )}

      {showTimeline && (
        <FadeUpSection key="timeline">
          <SectionHead kicker="Career Timeline" title="案件タイムライン" />
          <Timeline items={timelineItems} companyMap={companyMap} activeTech={timelineActiveTech} />
        </FadeUpSection>
      )}
    </div>
  );
}
