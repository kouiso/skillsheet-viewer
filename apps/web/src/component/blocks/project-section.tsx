'use client';

import { filterVisibleProjectData, type ProjectBlockData, type ProjectItem } from '@skillsheet/db/blocks';
import { groupProjectsByCompany } from '@skillsheet/db/group-by-company';
import { flattenTech } from '@skillsheet/db/process';
import { projectAreaText } from '@skillsheet/db/tech-area';
import { motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, useMemo, useState } from 'react';
import { CompanyJumpNav } from './company-jump-nav';
import { CompanySection } from './company-section';
import { ProcessOverview } from './process-overview';
import { matchesSearchTerms, parseProjectQuery } from './project-search';
import { SectionHead } from './section-head';
import { TechFilter } from './tech-filter';
import { Timeline } from './timeline';

interface ProjectSectionProps {
  data: ProjectBlockData;
  /** 工程俯瞰セクションを表示するか（ビュートグル）。 */
  showProcess?: boolean;
  /** 案件詳細セクションを表示するか（ビュートグル）。 */
  showProjects?: boolean;
  /** タイムラインセクションを表示するか（ビュートグル）。 */
  showTimeline?: boolean;
}

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

export function projectSearchHaystack(
  item: ProjectItem,
  companyName: string,
  companyNote: string,
  tech: string[],
): string {
  return [
    item.title,
    projectAreaText(item.scope, item.tech),
    item.role,
    companyName,
    companyNote,
    item.summary ?? item.duties,
    item.acquired,
    item.comment,
    ...tech,
  ].join(' ');
}

export function ProjectSection({
  data,
  showProcess = true,
  showProjects = true,
  showTimeline = true,
}: ProjectSectionProps) {
  const [query, setQuery] = useState('');
  const [activeTech, setActiveTech] = useState<string[]>([]);

  const visible = useMemo(() => filterVisibleProjectData(data), [data]);
  const companyMap = useMemo(() => new Map(visible.companies.map((c) => [c.id, c])), [visible.companies]);

  const itemsWithNo = useMemo(
    () => visible.items.map((item, index) => ({ item, no: index + 1, tech: flattenTech(item.tech) })),
    [visible.items],
  );

  const allTech = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { tech } of itemsWithNo) {
      for (const t of tech) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([aName, aCount], [bName, bCount]) => bCount - aCount || aName.localeCompare(bName))
      .map(([name, count]) => ({ name, count }));
  }, [itemsWithNo]);

  const parsedQuery = useMemo(() => parseProjectQuery(query), [query]);

  const filtered = useMemo(() => {
    return itemsWithNo.filter(({ item, tech }) => {
      const techOk = activeTech.length === 0 || tech.some((t) => activeTech.includes(t));
      if (!techOk) return false;
      if (parsedQuery.terms.length === 0) return true;
      const company = companyMap.get(item.companyId);
      const haystack = projectSearchHaystack(item, company?.name ?? '', company?.note ?? '', tech);
      return matchesSearchTerms(haystack, parsedQuery.terms, parsedQuery.requireAll);
    });
  }, [itemsWithNo, activeTech, parsedQuery, companyMap]);

  const companyGroups = useMemo(() => {
    const groups = groupProjectsByCompany(
      visible.companies,
      filtered.map((row) => row.item),
    );
    const byId = new Map(filtered.map((row) => [row.item.id, row]));
    return groups
      .map((group) => ({
        ...group,
        rows: group.items.map((item) => byId.get(item.id)).filter((row): row is (typeof filtered)[number] => !!row),
        totalCount: visible.items.filter((item) => item.companyId === group.companyId).length,
      }))
      .filter((group) => group.rows.length > 0);
  }, [visible.companies, visible.items, filtered]);

  const toggleTech = (t: string) => {
    setActiveTech((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };
  const clear = () => {
    setActiveTech([]);
    setQuery('');
  };

  if (visible.items.length === 0) return null;
  if (!showProcess && !showProjects && !showTimeline) return null;

  const timelineItems = showProjects ? filtered.map((x) => x.item) : visible.items;
  const timelineActiveTech = showProjects ? activeTech : [];
  const isSearching = parsedQuery.terms.length > 0 || activeTech.length > 0;

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
          <CompanyJumpNav
            groups={companyGroups.map((group) => ({
              companyId: group.companyId,
              company: group.company,
              count: group.rows.length,
            }))}
          />
          <div className="flex flex-col gap-10">
            {companyGroups.map((group) => (
              <CompanySection
                key={group.companyId}
                companyId={group.companyId}
                company={group.company}
                items={group.rows}
                totalCount={group.totalCount}
                isSearching={isSearching}
                activeTech={activeTech}
                queryTerms={parsedQuery.terms}
              />
            ))}
            {filtered.length === 0 && (
              <p className="rounded border border-dashed border-border-strong py-8 text-center text-sm text-foreground">
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
