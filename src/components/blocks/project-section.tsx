'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, useMemo, useState } from 'react';
import { filterVisibleProjectData, type ProjectBlockData } from '@/db/blocks';
import { type CompanyGroup, groupByCompany, UNASSIGNED_COMPANY_ID } from '@/db/blocks/group-by-company';
import { deriveDuration, flattenTech } from '@/db/process';
import { projectAreaText } from '@/db/tech-area';
import { CompanyJumpNav, type JumpTarget } from './company-jump-nav';
import { CompanySection } from './company-section';
import { ProcessOverview } from './process-overview';
import { ProjectCard } from './project-card';
import { SectionHead } from './section-head';
import { TechFilter } from './tech-filter';
import { Timeline } from './timeline';

interface ProjectSectionProps {
  data: ProjectBlockData;
  /**
   * 1枚のシートに project ブロックが複数あるときに見出しの id を分けるための接尾辞。
   * 省略すると kicker 由来の id をそのまま使う（ブロックが1つだけの通常ケース）。
   */
  headingIdSuffix?: string;
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

// 全角英数（ＴｙｐｅＳｃｒｉｐｔ 等）で検索しても半角のデータにヒットするよう、比較前に
// NFKC 正規化してから小文字化する。toLowerCase だけでは全角はそのまま別文字として扱われる。
function normalizeSearchText(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

/**
 * Gmail 風の検索クエリ解釈。スペース区切りは OR、"AND" と明示したときだけ全語必須。
 * 演算子語（and/or、大小問わず）自体は検索語から除く。
 */
function parseQuery(raw: string): { terms: string[]; matchAll: boolean } {
  // 演算子判定の前に正規化する。日本語入力のまま打つと全角の「ＡＮＤ」になりやすく、
  // 正規化前に判定すると演算子と認識されず、黙って OR 検索になる。
  const tokens = raw
    .trim()
    .split(/[\s　]+/)
    .filter(Boolean)
    .map(normalizeSearchText);
  const isOperator = (t: string) => t === 'and' || t === 'or';
  const terms = tokens.filter((t) => !isOperator(t));
  const matchAll = tokens.some((t) => t === 'and');
  return { terms, matchAll };
}

// project ブロックを「工程の俯瞰・案件詳細（会社ごと・技術フィルタ付き）・タイムライン」の
// 3セクションへ投影するダッシュボード。新ブロック型を増やさず、既存の project データの
// ビュー層としてのみ実装する。
export function ProjectSection({
  data,
  headingIdSuffix,
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

  // 出現頻度の降順。同数はプロトタイプでは順序不定だったので名前順で確定させる。
  const allTech = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { tech } of itemsWithNo) {
      for (const t of tech) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([aName, aCount], [bName, bCount]) => bCount - aCount || aName.localeCompare(bName))
      .map(([name, count]) => ({ name, count }));
  }, [itemsWithNo]);

  const { terms, matchAll } = useMemo(() => parseQuery(query), [query]);
  const searching = terms.length > 0 || activeTech.length > 0;

  const filtered = useMemo(() => {
    return itemsWithNo.filter(({ item, tech }) => {
      const techOk = activeTech.length === 0 || tech.some((t) => activeTech.includes(t));
      if (!techOk) return false;
      if (terms.length === 0) return true;
      const company = companyMap.get(item.companyId);
      const haystack = normalizeSearchText(
        [
          item.title,
          projectAreaText(item.scope, item.tech),
          item.role,
          company?.name ?? '',
          // 表示側（project-card.tsx）は `summary?.trim() || duties`。`??` だと空文字の
          // summary が採用され、カードに出ている duties の語で検索してもヒットしない。
          item.summary?.trim() || item.duties,
          ...tech,
        ].join(' '),
      );
      return matchAll ? terms.every((t) => haystack.includes(t)) : terms.some((t) => haystack.includes(t));
    });
  }, [itemsWithNo, activeTech, terms, matchAll, companyMap]);

  // クエリに一致した技術は、選択中（activeTech）でなくてもカードのチップを強調する
  // （何が検索語に当たったのかカード内で分かるようにする）。
  // 部分一致なのは意図的。上の絞り込み（haystack.includes）も部分一致で、`java` は
  // JavaScript の案件を拾う。ここだけ完全一致にすると「ヒットしたのに何も光らない」
  // カードが出て、強調が「なぜ当たったか」を説明する役目を果たさなくなる。
  // 部分一致の是非は絞り込み側の仕様なので、変えるならセットで別途変える。
  const queryMatchedTech = useMemo(() => {
    if (terms.length === 0) return new Set<string>();
    return new Set(
      allTech.map((t) => t.name).filter((name) => terms.some((t) => normalizeSearchText(name).includes(t))),
    );
  }, [allTech, terms]);

  const toggleTech = (t: string) => {
    setActiveTech((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };
  const clear = () => {
    setActiveTech([]);
    setQuery('');
  };

  // 会社ごとにグルーピングする。companyId 単位のまま分ける（名前でマージしない）。
  // filtered（絞り込み後）と全件（絞り込み前）の両方を会社単位でグループ化し、
  // レーン図には「検索中は絞り込み後、検索していなければ全件」を渡す。
  const groupsFiltered = useMemo(
    () => groupByCompany(visible.companies, filtered, (x) => x.item.companyId),
    [visible.companies, filtered],
  );
  const groupsAll = useMemo(
    () => groupByCompany(visible.companies, itemsWithNo, (x) => x.item.companyId),
    [visible.companies, itemsWithNo],
  );
  const allGroupById = useMemo(() => new Map(groupsAll.map((g) => [g.companyId, g])), [groupsAll]);

  // 検索で0件になった会社はセクションごと出さない。検索していない会社は
  // 案件0件（未割当）でも会社見出し自体は残す（エディタで会社だけ先に作れるため）。
  const sections = groupsFiltered.filter((g) => g.items.length > 0 || !searching);

  const jumpTargets: JumpTarget[] = sections.map((g) => ({
    id: `company-${g.companyId === UNASSIGNED_COMPANY_ID ? 'unassigned' : g.companyId}`,
    company: g.company,
    companyId: g.companyId,
    itemCount: g.items.length,
  }));

  // 可視案件が0件なら（会社だけ残っていても）表示するものが無いため何も描画しない。
  if (visible.items.length === 0) return null;
  if (!showProcess && !showProjects && !showTimeline) return null;

  // 案件詳細セクション（フィルタUI）が非表示のときは、そのフィルタ状態を
  // タイムラインへ持ち込まない（消したい方法が無いまま案件が消えて見えるのを防ぐ）。
  const timelineItems = showProjects ? filtered.map((x) => x.item) : visible.items;
  const timelineActiveTech = showProjects ? activeTech : [];

  const searchHint =
    searching && matchAll
      ? 'AND が入っているので、すべての語を含む案件だけを表示しています。'
      : 'スペース区切りはどれかを含む案件（OR）。AND と書くとすべて含む案件だけに絞ります。';

  return (
    <div className="space-y-10">
      {showProcess && (
        <FadeUpSection key="process">
          <SectionHead kicker="Process Coverage" title="担当工程の俯瞰" idSuffix={headingIdSuffix} />
          <ProcessOverview items={visible.items} />
        </FadeUpSection>
      )}

      {showProjects && (
        <FadeUpSection key="projects">
          <SectionHead kicker="Projects" title="案件詳細" idSuffix={headingIdSuffix} />
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
              hint={searchHint}
            />
          </div>

          <CompanyJumpNav targets={jumpTargets} />

          <div className="flex flex-col gap-10">
            {sections.map((group: CompanyGroup<(typeof filtered)[number]>) => {
              const id = `company-${group.companyId === UNASSIGNED_COMPANY_ID ? 'unassigned' : group.companyId}`;
              const allGroup = allGroupById.get(group.companyId);
              const totalCount = allGroup?.items.length ?? group.items.length;
              const laneSourceItems = searching ? group.items : (allGroup?.items ?? group.items);
              const laneItems = laneSourceItems.map(({ item, no }) => ({
                no,
                period: item.period,
                duration: item.duration?.trim() || deriveDuration(item.period),
              }));
              return (
                <CompanySection
                  key={group.companyId}
                  id={id}
                  company={group.company}
                  totalCount={totalCount}
                  visibleCount={group.items.length}
                  searching={searching}
                  laneItems={laneItems}
                >
                  {group.items.map(({ item, no, tech }) => (
                    <ProjectCard
                      key={item.id}
                      item={item}
                      no={no}
                      activeTech={[...activeTech, ...tech.filter((t) => queryMatchedTech.has(t))]}
                    />
                  ))}
                </CompanySection>
              );
            })}
            {sections.length === 0 && (
              <p
                className="rounded border border-dashed py-8 text-center text-sm text-muted-foreground"
                style={{ borderColor: 'var(--border-strong)' }}
              >
                条件に一致する案件がありません
              </p>
            )}
          </div>
        </FadeUpSection>
      )}

      {showTimeline && (
        <FadeUpSection key="timeline">
          <SectionHead kicker="Career Timeline" title="案件タイムライン" idSuffix={headingIdSuffix} />
          {/* Timeline は 0 件で null を返すため、見出しだけが残って下が真っ白になっていた。
              案件詳細と同じ空状態を出して「絞り込みの結果ゼロ件」だと分かるようにする。 */}
          {timelineItems.length === 0 ? (
            <p
              className="rounded border border-dashed py-8 text-center text-sm text-muted-foreground"
              style={{ borderColor: 'var(--border-strong)' }}
            >
              条件に一致する案件がありません
            </p>
          ) : (
            <Timeline items={timelineItems} companyMap={companyMap} activeTech={timelineActiveTech} />
          )}
        </FadeUpSection>
      )}
    </div>
  );
}
