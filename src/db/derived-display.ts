import type { CompanyInfo, ProjectItem, SkillEntry, StatItem } from './blocks';
import { deriveCompanyPeriod, flattenTech, parsePeriodBounds } from './process';

const ENGINEER_EXPERIENCE_LABELS = new Set(['エンジニア歴', 'エンジニア経験', '経験年数', '実務経験']);
const PROJECT_COUNT_LABELS = new Set(['案件数', 'プロジェクト数', '参画案件数', '参画プロジェクト数']);

/** サーバーからクライアントへ渡す、月初基準の固定月キー。 */
export function currentMonthKey(date = new Date()): number {
  return date.getFullYear() * 12 + date.getMonth();
}

/** 月数を計算できる精度の期間を、重複排除に使う連続した月キーへ変換する。 */
function periodMonthKeys(period: string, referenceMonth?: number): number[] {
  const bounds = parsePeriodBounds(period);
  // 年だけの期間から「1ヶ月」を捏造しない。継続中はSSRとHydrationで同じ固定月を使う。
  if (!bounds?.precise) return [];
  const start = Math.round(bounds.start * 12);
  if (bounds.openEnded && referenceMonth === undefined) return [];
  const end = bounds.openEnded ? Math.max(referenceMonth ?? start, start) : Math.round(bounds.end * 12);
  const months: number[] = [];
  for (let month = start; month <= end; month += 1) months.push(month);
  return months;
}

function collectProjectMonths(
  items: ProjectItem[],
  predicate: (item: ProjectItem) => boolean = () => true,
  referenceMonth?: number,
): Set<number> {
  const months = new Set<number>();
  for (const item of items) {
    if (!predicate(item)) continue;
    for (const month of periodMonthKeys(item.period, referenceMonth)) months.add(month);
  }
  return months;
}

/** 画面とPDFの統計枠へ表示する値を、表示対象案件から解決する。 */
export function resolveDisplayedStats(
  items: StatItem[],
  visibleProjects: ProjectItem[],
  referenceMonth?: number,
): StatItem[] {
  const experienceMonths = collectProjectMonths(visibleProjects, undefined, referenceMonth).size;
  return items.map((item) => {
    const label = item.label.trim();
    if (ENGINEER_EXPERIENCE_LABELS.has(label) && experienceMonths > 0) {
      return { ...item, value: String(Math.floor(experienceMonths / 12)) };
    }
    if (PROJECT_COUNT_LABELS.has(label)) {
      return { ...item, value: String(visibleProjects.length) };
    }
    return item;
  });
}

/** 手入力を優先し、空の場合だけ配下案件から会社期間を導出する。 */
export function resolveCompanyPeriod(company: CompanyInfo | undefined, items: ProjectItem[]): string {
  return company?.period.trim() || deriveCompanyPeriod(items.map((item) => item.period));
}

function stripTrailingVersion(value: string): string {
  return value.replace(/\s+v?\d+(?:\.\d+)*(?:[-.][a-z0-9]+)*$/i, '').trim();
}

/**
 * 複合名・括弧注釈・バージョン付きの既存データを、完全一致用の候補へ分解する。
 * 元データ自体は変更せず、表示時の導出にだけ用いる。
 */
export function normalizeTechnologyCandidates(value: string): Set<string> {
  const normalized = value.normalize('NFKC').trim();
  if (!normalized) return new Set();

  const parenthetical = [...normalized.matchAll(/\(([^()]*)\)/g)].map((match) => match[1]);
  const base = normalized.replace(/\([^()]*\)/g, ' ');
  const candidates = [base, ...parenthetical]
    .flatMap((part) => [part, ...part.split(/\s*(?:\/|(?<!\+)\+(?!\+)|,|、|・|&)\s*/)])
    .map(stripTrailingVersion)
    .map((part) => part.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US'))
    .filter(Boolean);
  return new Set(candidates);
}

export function technologyNamesMatch(skillName: string, projectTechnology: string): boolean {
  const skillCandidates = normalizeTechnologyCandidates(skillName);
  const projectCandidates = normalizeTechnologyCandidates(projectTechnology);
  return [...skillCandidates].some((candidate) => projectCandidates.has(candidate));
}

export function deriveSkillExperienceMonths(
  skillName: string,
  visibleProjects: ProjectItem[],
  referenceMonth?: number,
): number {
  return collectProjectMonths(
    visibleProjects,
    (item) => flattenTech(item.tech).some((technology) => technologyNamesMatch(skillName, technology)),
    referenceMonth,
  ).size;
}

export function formatExperienceMonths(months: number): string {
  return `${Math.floor(months / 12)}年${months % 12}ヶ月`;
}

export interface DisplayedSkillExperience {
  /** バー幅・並び替え用。手入力へ戻る場合も月へ換算して返す。 */
  months: number;
  /** 表示文字列。空なら年数を表示しない。 */
  label: string;
  derived: boolean;
}

export function resolveDisplayedSkillExperience(
  skill: Pick<SkillEntry, 'name' | 'years'>,
  visibleProjects: ProjectItem[],
  referenceMonth?: number,
): DisplayedSkillExperience {
  const derivedMonths = deriveSkillExperienceMonths(skill.name, visibleProjects, referenceMonth);
  if (derivedMonths > 0) {
    return { months: derivedMonths, label: formatExperienceMonths(derivedMonths), derived: true };
  }
  const fallbackMonths = Math.max(0, skill.years) * 12;
  return {
    months: fallbackMonths,
    label: skill.years > 0 ? `${skill.years}年` : '',
    derived: false,
  };
}
