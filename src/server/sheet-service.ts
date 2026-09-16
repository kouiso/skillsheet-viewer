// クライアントバンドルに巻き込まれた瞬間にビルドを失敗させる。
import 'server-only';

/**
 * スキルシート読み書きの共有サービス層（Issue #305）。
 *
 * tRPC router（app/api/trpc）と Remote MCP ツール（app/api/mcp）の両方がここを通る。
 * MCP から tRPC HTTP API を内側で叩く構成は Cookie 偽装経路になるため禁止で、
 * オーナー照合・ブロック検証・楽観ロック・差分生成・キャッシュ失効はこの層に集約する。
 *
 * エラーは SheetServiceError（code: NOT_FOUND / BAD_REQUEST / CONFLICT）か
 * db 層の ConflictError / SkillSheetNotFoundError で投げ、呼び出し側が
 * HTTP ステータスや MCP の isError へマップする。内部例外（SQL 等）はここで
 * 作らない — 握り潰しもしない（ログ・レスポンス方針は呼び出し側の責務）。
 */

import { revalidateTag } from 'next/cache';
import {
  type Block,
  type BlockInput,
  type CompanyInfo,
  listSheets as dbListSheets,
  getOwnerSkillSheetById,
  type OwnerSkillSheet,
  type ProjectBlockData,
  type ProjectItem,
  type ProjectTech,
  type SheetSummary,
  type StatItem,
  saveSkillSheetBlocks,
} from '@/db';

/** MCP/HTTP 共通の業務エラー分類。設計のエラー規約（Issue #305）に対応する。 */
export type SheetServiceErrorCode = 'NOT_FOUND' | 'BAD_REQUEST' | 'CONFLICT';

export class SheetServiceError extends Error {
  constructor(
    public readonly code: SheetServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SheetServiceError';
  }
}

/** 書き込み系ツールが返す差分エントリ。 */
export interface SheetChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** 書き込み系ツールの共通返却形式（Issue #305 設計の返却フォーマット）。 */
export interface SheetWriteResult {
  sheetId: string;
  targetId: string;
  updatedAt: Date;
  changes: SheetChange[];
}

// Route Handler は Server Action ではないため next/cache の updateTag は使えない
// （Next.js 16 公式: "It cannot be used in Route Handlers"）。tRPC mutation も
// MCP route も必ず Route Handler 経由なので、revalidateTag(tag, { expire: 0 }) で
// 即時失効させる（{ expire: 0 } なしだと即時失効が保証されない実績がある）。
export function invalidateDbSheetCache(): void {
  revalidateTag('db-sheet', { expire: 0 });
}

/** オーナーのシート一覧。listSheets が内部で owner_id 照合済み。 */
export async function listOwnerSheets(): Promise<SheetSummary[]> {
  return dbListSheets();
}

/**
 * オーナー所有が確認できたシートの詳細（updatedAt 付き）。
 * 他人のシート ID / 不存在は SkillSheetNotFoundError（= NOT_FOUND）。
 */
export async function getOwnerSheet(sheetId: string): Promise<OwnerSkillSheet> {
  return getOwnerSkillSheetById(sheetId);
}

/** Block[] → BlockInput[]（id/order を剥がす。order は配列順で再採番される）。 */
function toBlockInputs(blocks: Block[]): BlockInput[] {
  return blocks.map((block) => {
    // 判別ユニオンの type/data 対応を保つため、分岐して組み立て直す。
    switch (block.type) {
      case 'markdown':
        return { type: 'markdown', data: block.data };
      case 'table':
        return { type: 'table', data: block.data };
      case 'skills':
        return { type: 'skills', data: block.data };
      case 'experience':
        return { type: 'experience', data: block.data };
      case 'profile':
        return { type: 'profile', data: block.data };
      case 'stats':
        return { type: 'stats', data: block.data };
      case 'project':
        return { type: 'project', data: block.data };
      default: {
        // Block は閉じた判別ユニオンなので到達しないが、将来 type が増えたときに
        // ここで落ちるように網羅性チェックを残す。
        const exhaustive: never = block;
        return exhaustive;
      }
    }
  });
}

/**
 * シート全体を読み → 変更を適用 → 楽観ロック付きで保存 → キャッシュ失効、
 * という全書き込みツール共通の骨格。
 *
 * `mutate` は読み取ったシートから次のブロック列と差分・対象IDを返す純粋関数。
 * 保存時の ConflictError はそのまま呼び出し側へ伝播させる（保存しない保証は
 * saveSkillSheetBlocks のトランザクションが担う）。
 */
async function mutateOwnerSheet(
  sheetId: string,
  expectedUpdatedAt: Date,
  mutate: (sheet: OwnerSkillSheet) => { blocks: BlockInput[]; targetId: string; changes: SheetChange[] },
): Promise<SheetWriteResult> {
  const sheet = await getOwnerSheet(sheetId);
  const { blocks: nextBlocks, targetId, changes } = mutate(sheet);
  const { updatedAt } = await saveSkillSheetBlocks(sheet.title, nextBlocks, sheetId, expectedUpdatedAt);
  invalidateDbSheetCache();
  return { sheetId, targetId, updatedAt, changes };
}

/** tRPC の sheet.save 用: ブロック丸ごと保存 + キャッシュ失効。 */
export async function saveOwnerSheet(input: {
  title: string;
  blocks: BlockInput[];
  sheetId?: string;
  expectedUpdatedAt?: Date;
}): Promise<{ updatedAt: Date }> {
  const result = await saveSkillSheetBlocks(input.title, input.blocks, input.sheetId, input.expectedUpdatedAt);
  invalidateDbSheetCache();
  return result;
}

// --- project ブロック内の探索ヘルパー ---

function findProjectBlock(sheet: OwnerSkillSheet): Block & { type: 'project'; data: ProjectBlockData } {
  const block = sheet.blocks.find((b) => b.type === 'project');
  if (!block) {
    throw new SheetServiceError('NOT_FOUND', 'project ブロックがシートに存在しません');
  }
  return block as Block & { type: 'project'; data: ProjectBlockData };
}

function findStatsBlock(sheet: OwnerSkillSheet): Block & { type: 'stats'; data: { items: StatItem[] } } {
  const block = sheet.blocks.find((b) => b.type === 'stats');
  if (!block) {
    throw new SheetServiceError('NOT_FOUND', 'stats ブロックがシートに存在しません');
  }
  return block as Block & { type: 'stats'; data: { items: StatItem[] } };
}

// --- 読み取り系 ---

export interface ProjectSearchHit {
  sheetId: string;
  /** 案件名一致のときはその案件、会社名一致のときは配下案件、技術名一致のときはその案件。 */
  projectId: string | null;
  companyId: string;
  matchedOn: 'project' | 'company' | 'tech';
  projectTitle: string | null;
  companyName: string;
  hidden: boolean;
}

/**
 * 案件名・会社名・技術名の完全一致で候補を返す。
 * `projectId` と `companyId` は必ずフィールドとして返す（会社のみ一致で案件 0 件のとき
 * projectId は null）。sheetId 省略時はオーナーの全シートを対象にする。
 */
export async function searchProjects(query: string, sheetId?: string): Promise<ProjectSearchHit[]> {
  const sheets = sheetId
    ? [await getOwnerSheet(sheetId)]
    : await Promise.all((await listOwnerSheets()).map((s) => getOwnerSheet(s.id)));
  const hits: ProjectSearchHit[] = [];

  for (const sheet of sheets) {
    const projectBlock = sheet.blocks.find((b) => b.type === 'project');
    if (!projectBlock) continue;
    const data = (projectBlock as Block & { type: 'project' }).data;

    const companyById = new Map(data.companies.map((c) => [c.id, c]));

    for (const item of data.items) {
      if (item.title === query) {
        hits.push({
          sheetId: sheet.id,
          projectId: item.id,
          companyId: item.companyId,
          matchedOn: 'project',
          projectTitle: item.title,
          companyName: companyById.get(item.companyId)?.name ?? '',
          hidden: item.hidden === true,
        });
      }
      const techHit = flattenTechValues(item.tech).includes(query);
      if (techHit) {
        hits.push({
          sheetId: sheet.id,
          projectId: item.id,
          companyId: item.companyId,
          matchedOn: 'tech',
          projectTitle: item.title,
          companyName: companyById.get(item.companyId)?.name ?? '',
          hidden: item.hidden === true,
        });
      }
    }

    for (const company of data.companies) {
      if (company.name !== query) continue;
      const members = data.items.filter((i) => i.companyId === company.id);
      if (members.length === 0) {
        hits.push({
          sheetId: sheet.id,
          projectId: null,
          companyId: company.id,
          matchedOn: 'company',
          projectTitle: null,
          companyName: company.name,
          hidden: company.hidden === true,
        });
      }
      for (const item of members) {
        hits.push({
          sheetId: sheet.id,
          projectId: item.id,
          companyId: company.id,
          matchedOn: 'company',
          projectTitle: item.title,
          companyName: company.name,
          hidden: company.hidden === true || item.hidden === true,
        });
      }
    }
  }
  return hits;
}

function flattenTechValues(tech: ProjectTech): string[] {
  return [...tech.lang, ...tech.fw, ...tech.db, ...tech.infra, ...tech.tools, ...tech.collab];
}

// --- 書き込み系 ---

/** update_project_item で更新可能なフィールド（指定されたものだけ反映する）。 */
export type ProjectItemPatch = Partial<
  Pick<
    ProjectItem,
    | 'companyId'
    | 'title'
    | 'scope'
    | 'period'
    | 'role'
    | 'team'
    | 'process'
    | 'duties'
    | 'acquired'
    | 'comment'
    | 'summary'
    | 'duration'
    | 'hidden'
    | 'periodStart'
    | 'periodEnd'
    | 'ongoing'
  >
> & { tech?: Partial<ProjectTech> };

const PROJECT_ITEM_PATCHABLE_FIELDS = [
  'companyId',
  'title',
  'scope',
  'period',
  'role',
  'team',
  'process',
  'duties',
  'acquired',
  'comment',
  'summary',
  'duration',
  'hidden',
  'periodStart',
  'periodEnd',
  'ongoing',
] as const;

/** 案件 1 件の指定フィールドだけを更新する。1 回につき 1 案件。 */
export async function updateProjectItem(input: {
  sheetId: string;
  projectId: string;
  expectedUpdatedAt: Date;
  fields: ProjectItemPatch;
}): Promise<SheetWriteResult> {
  const patchKeys = Object.keys(input.fields).filter((k) => (input.fields as Record<string, unknown>)[k] !== undefined);
  if (patchKeys.length === 0) {
    throw new SheetServiceError('BAD_REQUEST', '更新するフィールドが指定されていません');
  }
  const unknown = patchKeys.filter(
    (k) => k !== 'tech' && !PROJECT_ITEM_PATCHABLE_FIELDS.includes(k as (typeof PROJECT_ITEM_PATCHABLE_FIELDS)[number]),
  );
  if (unknown.length > 0) {
    throw new SheetServiceError('BAD_REQUEST', `更新できないフィールドが含まれています: ${unknown.join(', ')}`);
  }

  return mutateOwnerSheet(input.sheetId, input.expectedUpdatedAt, (sheet) => {
    const projectBlock = findProjectBlock(sheet);
    const item = projectBlock.data.items.find((i) => i.id === input.projectId);
    if (!item) {
      throw new SheetServiceError('NOT_FOUND', `指定された案件が見つかりません: ${input.projectId}`);
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const next: ProjectItem = { ...item, tech: { ...item.tech } };

    for (const key of patchKeys) {
      if (key === 'tech') {
        const techPatch = input.fields.tech ?? {};
        for (const [subKey, subValue] of Object.entries(techPatch)) {
          if (subValue === undefined) continue;
          if (!(subKey in next.tech)) {
            throw new SheetServiceError('BAD_REQUEST', `tech に存在しないキーが指定されました: ${subKey}`);
          }
          (next.tech as unknown as Record<string, string[]>)[subKey] = subValue as string[];
        }
        continue;
      }
      const value = (input.fields as Record<string, unknown>)[key];
      if (
        key === 'companyId' &&
        typeof value === 'string' &&
        value !== '' &&
        !projectBlock.data.companies.some((c) => c.id === value)
      ) {
        throw new SheetServiceError('NOT_FOUND', `指定された会社が見つかりません: ${value}`);
      }
      (next as unknown as Record<string, unknown>)[key] = value;
    }

    for (const key of Object.keys(next) as (keyof ProjectItem)[]) {
      if (JSON.stringify(item[key]) !== JSON.stringify(next[key])) {
        before[key] = item[key];
        after[key] = next[key];
      }
    }
    const changes = Object.keys(before).map((field) => ({ field, before: before[field], after: after[field] }));

    const nextData: ProjectBlockData = {
      companies: projectBlock.data.companies,
      items: projectBlock.data.items.map((i) => (i.id === input.projectId ? next : i)),
    };
    const blocks = toBlockInputs(sheet.blocks).map((b) =>
      b.type === 'project' ? { type: 'project' as const, data: nextData } : b,
    );
    return { blocks, targetId: input.projectId, changes };
  });
}

/** update_company で更新可能なフィールド。 */
export type CompanyPatch = Partial<Pick<CompanyInfo, 'name' | 'kind' | 'period' | 'note' | 'hidden'>>;

const COMPANY_PATCHABLE_FIELDS = ['name', 'kind', 'period', 'note', 'hidden'] as const;

/** 会社 1 社の指定フィールドだけを更新する。1 回につき 1 会社。 */
export async function updateCompany(input: {
  sheetId: string;
  companyId: string;
  expectedUpdatedAt: Date;
  fields: CompanyPatch;
}): Promise<SheetWriteResult> {
  const patchKeys = Object.keys(input.fields).filter((k) => (input.fields as Record<string, unknown>)[k] !== undefined);
  if (patchKeys.length === 0) {
    throw new SheetServiceError('BAD_REQUEST', '更新するフィールドが指定されていません');
  }
  const unknown = patchKeys.filter(
    (k) => !COMPANY_PATCHABLE_FIELDS.includes(k as (typeof COMPANY_PATCHABLE_FIELDS)[number]),
  );
  if (unknown.length > 0) {
    throw new SheetServiceError('BAD_REQUEST', `更新できないフィールドが含まれています: ${unknown.join(', ')}`);
  }

  return mutateOwnerSheet(input.sheetId, input.expectedUpdatedAt, (sheet) => {
    const projectBlock = findProjectBlock(sheet);
    const company = projectBlock.data.companies.find((c) => c.id === input.companyId);
    if (!company) {
      throw new SheetServiceError('NOT_FOUND', `指定された会社が見つかりません: ${input.companyId}`);
    }

    const next: CompanyInfo = { ...company };
    for (const key of patchKeys) {
      (next as unknown as Record<string, unknown>)[key] = (input.fields as Record<string, unknown>)[key];
    }

    const changes = patchKeys
      .filter(
        (key) => JSON.stringify(company[key as keyof CompanyInfo]) !== JSON.stringify(next[key as keyof CompanyInfo]),
      )
      .map((field) => ({
        field,
        before: company[field as keyof CompanyInfo],
        after: next[field as keyof CompanyInfo],
      }));

    const nextData: ProjectBlockData = {
      companies: projectBlock.data.companies.map((c) => (c.id === input.companyId ? next : c)),
      items: projectBlock.data.items,
    };
    const blocks = toBlockInputs(sheet.blocks).map((b) =>
      b.type === 'project' ? { type: 'project' as const, data: nextData } : b,
    );
    return { blocks, targetId: input.companyId, changes };
  });
}

/**
 * stats ブロックの 1 項目を更新する。
 * index と expectedLabel の両方で対象を確認する — index が有効でもラベルが
 * 一致しなければ「意図した行ではない」ため NOT_FOUND で拒否する。
 */
export async function updateStatsItem(input: {
  sheetId: string;
  index: number;
  expectedLabel: string;
  expectedUpdatedAt: Date;
  fields: Partial<Pick<StatItem, 'label' | 'value' | 'unit'>>;
}): Promise<SheetWriteResult> {
  const patchKeys = (['label', 'value', 'unit'] as const).filter((k) => input.fields[k] !== undefined);
  if (patchKeys.length === 0) {
    throw new SheetServiceError('BAD_REQUEST', '更新するフィールドが指定されていません');
  }
  const unknown = Object.keys(input.fields).filter((k) => !['label', 'value', 'unit'].includes(k));
  if (unknown.length > 0) {
    throw new SheetServiceError('BAD_REQUEST', `更新できないフィールドが含まれています: ${unknown.join(', ')}`);
  }

  return mutateOwnerSheet(input.sheetId, input.expectedUpdatedAt, (sheet) => {
    const statsBlock = findStatsBlock(sheet);
    const target = statsBlock.data.items[input.index];
    if (!target || target.label !== input.expectedLabel) {
      throw new SheetServiceError(
        'NOT_FOUND',
        `index ${input.index} に expectedLabel "${input.expectedLabel}" の項目が見つかりません`,
      );
    }

    const next: StatItem = { ...target };
    for (const key of patchKeys) {
      next[key] = input.fields[key] as string;
    }
    const changes = patchKeys
      .filter((key) => target[key] !== next[key])
      .map((field) => ({ field, before: target[field], after: next[field] }));

    const nextData = { items: statsBlock.data.items.map((i, idx) => (idx === input.index ? next : i)) };
    const blocks = toBlockInputs(sheet.blocks).map((b) =>
      b.type === 'stats' ? { type: 'stats' as const, data: nextData } : b,
    );
    return { blocks, targetId: `stats:${input.index}`, changes };
  });
}

/** add_project_item で受け付ける新規案件のフィールド（id はサーバー側生成）。 */
export type NewProjectItem = Omit<ProjectItem, 'id' | 'companyId' | 'tech'> & {
  companyId?: string;
  tech?: Partial<ProjectTech>;
};

/** 案件を 1 件追加する。ID はサーバー側で生成し、クライアントの id 指定は受け付けない。 */
export async function addProjectItem(input: {
  sheetId: string;
  expectedUpdatedAt: Date;
  item: NewProjectItem;
}): Promise<SheetWriteResult> {
  return mutateOwnerSheet(input.sheetId, input.expectedUpdatedAt, (sheet) => {
    const projectBlock = findProjectBlock(sheet);
    const companyId = input.item.companyId ?? '';
    if (companyId !== '' && !projectBlock.data.companies.some((c) => c.id === companyId)) {
      throw new SheetServiceError('NOT_FOUND', `指定された会社が見つかりません: ${companyId}`);
    }

    const newItem: ProjectItem = {
      id: crypto.randomUUID(),
      companyId,
      title: input.item.title,
      scope: input.item.scope,
      period: input.item.period,
      role: input.item.role,
      team: input.item.team,
      tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [], ...input.item.tech },
      process: input.item.process,
      duties: input.item.duties,
      acquired: input.item.acquired,
      comment: input.item.comment,
      ...(input.item.summary !== undefined ? { summary: input.item.summary } : {}),
      ...(input.item.duration !== undefined ? { duration: input.item.duration } : {}),
      ...(input.item.hidden !== undefined ? { hidden: input.item.hidden } : {}),
      ...(input.item.periodStart !== undefined ? { periodStart: input.item.periodStart } : {}),
      ...(input.item.periodEnd !== undefined ? { periodEnd: input.item.periodEnd } : {}),
      ...(input.item.ongoing !== undefined ? { ongoing: input.item.ongoing } : {}),
    };

    const nextData: ProjectBlockData = {
      companies: projectBlock.data.companies,
      items: [...projectBlock.data.items, newItem],
    };
    const blocks = toBlockInputs(sheet.blocks).map((b) =>
      b.type === 'project' ? { type: 'project' as const, data: nextData } : b,
    );
    return { blocks, targetId: newItem.id, changes: [{ field: 'items', before: null, after: newItem }] };
  });
}

/**
 * 案件の表示順を projectIds の並びで一括置換する。
 * 重複・欠落・未知 ID はすべて拒否する（部分適用すると事故時に順序が壊れるため、
 * 集合が既存と完全一致する場合のみ適用する）。
 */
export async function reorderProjectItems(input: {
  sheetId: string;
  expectedUpdatedAt: Date;
  projectIds: string[];
}): Promise<SheetWriteResult> {
  return mutateOwnerSheet(input.sheetId, input.expectedUpdatedAt, (sheet) => {
    const projectBlock = findProjectBlock(sheet);
    const existingIds = projectBlock.data.items.map((i) => i.id);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const id of input.projectIds) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    if (duplicates.length > 0) {
      throw new SheetServiceError('BAD_REQUEST', `projectIds に重複があります: ${duplicates.join(', ')}`);
    }
    const existingSet = new Set(existingIds);
    const unknownIds = input.projectIds.filter((id) => !existingSet.has(id));
    if (unknownIds.length > 0) {
      throw new SheetServiceError('BAD_REQUEST', `未知の案件 ID が含まれています: ${unknownIds.join(', ')}`);
    }
    const requestedSet = new Set(input.projectIds);
    const missingIds = existingIds.filter((id) => !requestedSet.has(id));
    if (missingIds.length > 0) {
      throw new SheetServiceError(
        'BAD_REQUEST',
        `projectIds に既存の案件 ID が欠落しています: ${missingIds.join(', ')}`,
      );
    }

    const itemById = new Map(projectBlock.data.items.map((i) => [i.id, i]));
    const orderedItems = input.projectIds.map((id) => itemById.get(id) as ProjectItem);
    const orderChanged = existingIds.some((id, idx) => input.projectIds[idx] !== id);

    const nextData: ProjectBlockData = { companies: projectBlock.data.companies, items: orderedItems };
    const blocks = toBlockInputs(sheet.blocks).map((b) =>
      b.type === 'project' ? { type: 'project' as const, data: nextData } : b,
    );
    return {
      blocks,
      targetId: 'items',
      changes: orderChanged ? [{ field: 'items.order', before: existingIds, after: input.projectIds }] : [],
    };
  });
}
