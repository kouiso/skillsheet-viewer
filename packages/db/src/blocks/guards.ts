/**
 * ブロックデータの型ガード群。
 * zod を入れず DB パッケージの依存を増やさない軽量判定。
 */

import type {
  BlockInput,
  CompanyInfo,
  ExperienceBlockData,
  MarkdownBlockData,
  ProfileBlockData,
  ProjectBlockData,
  ProjectItem,
  ProjectTech,
  SkillEntry,
  SkillsBlockData,
  StatItem,
  StatsBlockData,
  TableAlign,
  TableBlockData,
  TableColumn,
} from './index';

const TABLE_ALIGNS: readonly TableAlign[] = ['left', 'center', 'right'];

function isTableAlign(value: unknown): value is TableAlign {
  return typeof value === 'string' && (TABLE_ALIGNS as readonly string[]).includes(value);
}

export function isMarkdownBlockData(data: unknown): data is MarkdownBlockData {
  return typeof data === 'object' && data !== null && typeof (data as MarkdownBlockData).markdown === 'string';
}

export function isTableBlockData(data: unknown): data is TableBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const { columns, rows } = data as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(columns) || columns.length === 0) return false;
  const columnsOk = columns.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as TableColumn).label === 'string' &&
      isTableAlign((c as TableColumn).align),
  );
  if (!columnsOk) return false;
  if (!Array.isArray(rows)) return false;
  return rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'));
}

export function isSkillsBlockData(data: unknown): data is SkillsBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const { category, skills } = data as { category?: unknown; skills?: unknown };
  if (typeof category !== 'string') return false;
  if (!Array.isArray(skills)) return false;
  return skills.every(
    (s) =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as SkillEntry).name === 'string' &&
      typeof (s as SkillEntry).years === 'number' &&
      typeof (s as SkillEntry).level === 'string',
  );
}

export function isExperienceBlockData(data: unknown): data is ExperienceBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.company === 'string' &&
    typeof d.startDate === 'string' &&
    typeof d.endDate === 'string' &&
    typeof d.role === 'string' &&
    typeof d.description === 'string'
  );
}

export function isProfileBlockData(data: unknown): data is ProfileBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.name !== 'string') return false;
  if (typeof d.title !== 'string') return false;
  if (typeof d.pr !== 'string') return false;
  if (!Array.isArray(d.strengths) || !d.strengths.every((s) => typeof s === 'string')) return false;
  if (typeof d.meta !== 'object' || d.meta === null) return false;
  // 後方互換: company は存在するなら string（欠如は許容）。
  if (d.company !== undefined && typeof d.company !== 'string') return false;
  return true;
}

export function isStatsBlockData(data: unknown): data is StatsBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const { items } = data as { items?: unknown };
  if (!Array.isArray(items)) return false;
  return items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as StatItem).value === 'string' &&
      typeof (item as StatItem).unit === 'string' &&
      typeof (item as StatItem).label === 'string',
  );
}

function isProjectTech(t: unknown): t is ProjectTech {
  if (typeof t !== 'object' || t === null) return false;
  const tech = t as Record<string, unknown>;
  const keys: (keyof ProjectTech)[] = ['lang', 'fw', 'db', 'infra', 'tools', 'collab'];
  return keys.every((k) => Array.isArray(tech[k]) && (tech[k] as unknown[]).every((v) => typeof v === 'string'));
}

// optional フィールドの「存在するなら型が正しい」チェック（欠如は許容 = 後方互換）。
function optionalTypeOk(value: unknown, type: 'string' | 'boolean'): boolean {
  return value === undefined || typeof value === type;
}

export function isProjectBlockData(data: unknown): data is ProjectBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.companies)) return false;
  if (!Array.isArray(d.items)) return false;
  const companiesOk = d.companies.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as CompanyInfo).id === 'string' &&
      typeof (c as CompanyInfo).name === 'string' &&
      optionalTypeOk((c as CompanyInfo).hidden, 'boolean'),
  );
  if (!companiesOk) return false;
  return d.items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ProjectItem).id === 'string' &&
      typeof (item as ProjectItem).companyId === 'string' &&
      isProjectTech((item as ProjectItem).tech) &&
      Array.isArray((item as ProjectItem).process) &&
      optionalTypeOk((item as ProjectItem).hidden, 'boolean') &&
      optionalTypeOk((item as ProjectItem).periodStart, 'string') &&
      optionalTypeOk((item as ProjectItem).periodEnd, 'string') &&
      optionalTypeOk((item as ProjectItem).ongoing, 'boolean'),
  );
}

/** untyped な入力（クライアント由来）が正当な BlockInput かを判定する。 */
export function isBlockInput(value: unknown): value is BlockInput {
  if (typeof value !== 'object' || value === null) return false;
  const { type, data } = value as { type?: unknown; data?: unknown };
  if (type === 'markdown') return isMarkdownBlockData(data);
  if (type === 'table') return isTableBlockData(data);
  if (type === 'skills') return isSkillsBlockData(data);
  if (type === 'experience') return isExperienceBlockData(data);
  if (type === 'profile') return isProfileBlockData(data);
  if (type === 'stats') return isStatsBlockData(data);
  if (type === 'project') return isProjectBlockData(data);
  return false;
}
