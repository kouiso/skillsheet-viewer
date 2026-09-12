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
  visibleProjects: ProjectItem[] | undefined,
  referenceMonth?: number,
): StatItem[] {
  if (visibleProjects === undefined) return items;
  const experienceMonths = collectProjectMonths(visibleProjects, undefined, referenceMonth).size;
  return items.map((item) => {
    const label = item.label.trim();
    if (ENGINEER_EXPERIENCE_LABELS.has(label) && experienceMonths > 0) {
      const unit = item.unit.trim();
      if (unit === '年') return { ...item, value: String(Math.floor(experienceMonths / 12)) };
      if (/^(?:ヶ|か|ケ)月$/.test(unit)) return { ...item, value: String(experienceMonths) };
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
  return value
    .replace(/\s+v?\d+(?:\.\d+)*(?:[-.][a-z0-9]+)*$/i, '')
    .replace(/\s+\d+系$/, '')
    .trim();
}

/**
 * 表記揺れを同一技術の正規キーへ寄せる承認済み別名辞書。
 * 正規化（NFKC・小文字化・版除去）の後でだけ適用し、キーは正規化済みの小文字形で持つ。
 * React / React Native のような関連技術の同一視は経験期間の水増しになるため禁止。
 * 追加する別名は「同一技術である」と実データで確認できたものだけに絞る。
 */
const TECHNOLOGY_ALIASES: Record<string, string> = {
  // NestJS / Nest.js は同一フレームワーク。表記揺れで経験月数が過小算出されていた（issue M01）。
  nestjs: 'nest.js',
  // K8S は Kubernetes の略称（実データでは "K8S" 表記の案件のみ存在）。
  k8s: 'kubernetes',
  // Prisma ORM / Prisma、Sanity CMS / Sanity は同一プロダクト。
  'prisma orm': 'prisma',
  'sanity cms': 'sanity',
};

/**
 * 複合名・括弧注釈・バージョン付きの既存データを、完全一致用の候補へ分解する。
 * 括弧内は技術の注釈（RDS・Hooks 等）であり本体名ではないため、
 * 本体候補（primary）と注釈候補（annotation）を分けて返す。
 * 元データ自体は変更せず、表示時の導出にだけ用いる。
 */
function normalizeTechnologyParts(value: string): { primary: Set<string>; annotation: Set<string> } {
  const normalized = value.normalize('NFKC').trim();
  const empty = { primary: new Set<string>(), annotation: new Set<string>() };
  if (!normalized) return empty;

  const parenthetical = [...normalized.matchAll(/\(([^()]*)\)/g)].map((match) => match[1]);
  const base = normalized.replace(/\([^()]*\)/g, ' ');
  const splitPart = (part: string) =>
    [part, ...part.split(/\s*(?:\/|(?<!\+)\+(?!\+)|,|、|・|&)\s*/)]
      .map(stripTrailingVersion)
      .map((piece) => piece.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US'))
      .map((piece) => TECHNOLOGY_ALIASES[piece] ?? piece)
      .filter(Boolean);
  return { primary: new Set(splitPart(base)), annotation: new Set(parenthetical.flatMap(splitPart)) };
}

export function normalizeTechnologyCandidates(value: string): Set<string> {
  const { primary, annotation } = normalizeTechnologyParts(value);
  return new Set([...primary, ...annotation]);
}

/**
 * 同一技術かどうかの判定。本体名（括弧注釈を除く正規形）の一致だけを同一視する。
 * 「PostgreSQL (RDS)」と「RDS」は同一技術ではない（RDSは注釈=関連技術）。
 * 経験月数の集計では technologyNamesRelated を使うこと。
 */
export function technologyNamesMatch(skillName: string, projectTechnology: string): boolean {
  const skill = normalizeTechnologyParts(skillName);
  const project = normalizeTechnologyParts(projectTechnology);
  return [...skill.primary].some((c) => project.primary.has(c));
}

/**
 * 経験月数集計用の「関連技術」判定。同一技術（本体名一致）に加えて、
 * 片方の本体名が他方の注釈と一致する場合も関連ありとみなす。
 * 例: スキル「RDS」は「MySQL (RDS)」「PostgreSQL (RDS)」を使う案件の経験に含む。
 * 注釈どうし（「PostgreSQL (RDS)」と「MySQL (RDS)」の rds）だけでは関連にしない。
 */
export function technologyNamesRelated(skillName: string, projectTechnology: string): boolean {
  const skill = normalizeTechnologyParts(skillName);
  const project = normalizeTechnologyParts(projectTechnology);
  return (
    [...skill.primary].some((c) => project.primary.has(c)) ||
    [...skill.primary].some((c) => project.annotation.has(c)) ||
    [...skill.annotation].some((c) => project.primary.has(c))
  );
}

export function deriveSkillExperienceMonths(
  skillName: string,
  visibleProjects: ProjectItem[],
  referenceMonth?: number,
): number {
  return collectProjectMonths(
    visibleProjects,
    (item) => flattenTech(item.tech).some((technology) => technologyNamesRelated(skillName, technology)),
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
