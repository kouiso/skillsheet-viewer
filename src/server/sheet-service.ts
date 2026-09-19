// クライアントバンドルに巻き込まれた瞬間にビルドを失敗させる。
import 'server-only';

/**
 * スキルシート読み書きの共有サービス層（Issue #305）。
 *
 * Remote MCP ツール（app/api/mcp）がここを通る。MCP から tRPC HTTP API を内側で叩く
 * 構成は Cookie 偽装経路になるため禁止で、オーナー照合・ブロック検証・楽観ロック・
 * 差分生成・キャッシュ失効はこの層に集約する。
 *
 * 読み書きは必ず文書境界（src/db/document-service.ts → skillsheet_private.*）を通す。
 * 楽観ロックのトークンは revision（文字列の正整数）— get_sheet / 書き込み結果の
 * revision をクライアントが expectedRevision へそのまま渡す。
 *
 * エラーは SheetServiceError（code: NOT_FOUND / BAD_REQUEST / CONFLICT）か
 * db 層の DocumentError で投げ、呼び出し側が HTTP ステータスや MCP の isError へ
 * マップする。内部例外（SQL 等）はここで作らない — 握り潰しもしない。
 */

import { revalidateTag } from 'next/cache';
import type { CompanyInfo, ProjectBlockData, ProjectItem, ProjectTech, StatItem } from '@/db/block';
import { getDb } from '@/db/client';
import type { RawDocumentBlock } from '@/db/document-contract';
import { createDocumentService, DocumentError, type DocumentSnapshot } from '@/db/document-service';
import { getOwnerId } from '@/db/skillsheet';

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
  /** 保存後の文書 revision。次の書き込みの expectedRevision に使う。 */
  revision: string;
  changes: SheetChange[];
}

// Route Handler は Server Action ではないため next/cache の updateTag は使えない
// （Next.js 16 公式: "It cannot be used in Route Handlers"）。tRPC mutation も
// MCP route も必ず Route Handler 経由なので、revalidateTag(tag, { expire: 0 }) で
// 即時失効させる（{ expire: 0 } なしだと即時失効が保証されない実績がある）。
export function invalidateDbSheetCache(): void {
  // 文書のコミット後に呼ぶ。ここで throw すると「書込みは成功したのに失敗と報告」になり、
  // 呼び出し側の再試行が revision CONFLICT を起こす（#349）。失敗しても握りつぶし、
  // 古いキャッシュは次回の自然失効に任せる。
  try {
    revalidateTag('db-sheet', { expire: 0 });
  } catch {
    console.warn('Document committed; cache invalidation pending');
  }
}

function documents() {
  return createDocumentService(getDb(), getOwnerId());
}

/** MCP の list_sheets が返す一覧行。updatedAt は表示専用（CAS には revision を使う）。 */
export interface OwnerSheetSummary {
  id: string;
  title: string;
  isDefault: boolean;
  updatedAt: string;
}

/** オーナーのシート一覧。文書境界が内部で owner 照合済み。 */
export async function listOwnerSheets(): Promise<OwnerSheetSummary[]> {
  return (await documents().list()).map((s) => ({
    id: s.sheetId,
    title: s.title,
    isDefault: s.isDefault,
    updatedAt: s.updatedAt,
  }));
}

/**
 * オーナー所有が確認できたシートのスナップショット（revision 付き）。
 * 他人のシート ID / 不存在 / 空は NOT_FOUND。文書が壊れている場合は
 * DocumentError（INVALID_STATE / UNREADABLE）がそのまま伝播する。
 */
export async function getOwnerSheet(sheetId: string): Promise<DocumentSnapshot> {
  const result = await documents().read(sheetId);
  if (result.status === 'OK') return result.snapshot;
  if (result.status === 'NOT_FOUND' || result.status === 'EMPTY') {
    throw new SheetServiceError('NOT_FOUND', `シートが見つかりません: ${sheetId}`);
  }
  throw new DocumentError(result.status);
}

// RawDocumentBlock.data は unknown。文書境界の検証（isBlockInput）を通った値だけが
// ここへ来るので、type 判別後の data は各ブロック型へ安全にキャストできる。
// 同型ブロックは複数あり得る（contract は型の一意性を要求しない）ため、
// 「先頭の一致」ではなく対象エンティティを含むブロックを特定して操作する（#357）。
function projectBlocks(sheet: DocumentSnapshot): (RawDocumentBlock & { data: ProjectBlockData })[] {
  return sheet.blocks.filter((b) => b.type === 'project') as (RawDocumentBlock & { data: ProjectBlockData })[];
}

/** 指定 id の案件を含む project ブロックを返す。 */
function findProjectBlockByItemId(
  sheet: DocumentSnapshot,
  itemId: string,
): RawDocumentBlock & { data: ProjectBlockData } {
  const block = projectBlocks(sheet).find((b) => b.data.items.some((i) => i.id === itemId));
  if (!block) {
    throw new SheetServiceError('NOT_FOUND', `指定された案件が見つかりません: ${itemId}`);
  }
  return block;
}

/** 指定 id の会社を含む project ブロックを返す。 */
function findProjectBlockByCompanyId(
  sheet: DocumentSnapshot,
  companyId: string,
): RawDocumentBlock & { data: ProjectBlockData } {
  const block = projectBlocks(sheet).find((b) => b.data.companies.some((c) => c.id === companyId));
  if (!block) {
    throw new SheetServiceError('NOT_FOUND', `指定された会社が見つかりません: ${companyId}`);
  }
  return block;
}

/**
 * index と expectedLabel が一致する stats ブロックを返す。
 * 複数 stats ブロックがある場合、両方の条件に合致したブロックだけを対象にする
 * （index だけだと別ブロックの同位置を誤爆するため）。
 */
function findStatsBlockByIndex(
  sheet: DocumentSnapshot,
  index: number,
  expectedLabel: string,
): RawDocumentBlock & { data: { items: StatItem[] } } {
  const blocks = sheet.blocks.filter((b) => b.type === 'stats') as (RawDocumentBlock & {
    data: { items: StatItem[] };
  })[];
  const block = blocks.find((b) => b.data.items[index]?.label === expectedLabel);
  if (!block) {
    if (blocks.length === 0) {
      throw new SheetServiceError('NOT_FOUND', 'stats ブロックがシートに存在しません');
    }
    throw new SheetServiceError(
      'NOT_FOUND',
      `index ${index} に expectedLabel "${expectedLabel}" の項目が見つかりません`,
    );
  }
  return block;
}

/** ブロック列のうち指定 id の 1 ブロックの data だけを差し替える（id/order は保持する）。 */
function replaceBlockData(blocks: RawDocumentBlock[], blockId: string, data: unknown): RawDocumentBlock[] {
  return blocks.map((b) => (b.id === blockId ? { ...b, data } : b));
}

/**
 * シート全体を読み → 変更を適用 → revision CAS で保存 → キャッシュ失効、
 * という全書き込みツール共通の骨格。
 *
 * `mutate` は読み取ったスナップショットから次のブロック列と差分・対象IDを返す
 * 純粋関数。保存時の競合（DocumentError 'CONFLICT'）はそのまま呼び出し側へ伝播
 * させる（保存しない保証は文書境界の CAS が担う）。
 */
async function mutateOwnerSheet(
  sheetId: string,
  expectedRevision: string,
  mutate: (sheet: DocumentSnapshot) => { blocks: RawDocumentBlock[]; targetId: string; changes: SheetChange[] },
): Promise<SheetWriteResult> {
  const sheet = await getOwnerSheet(sheetId);
  const { blocks, targetId, changes } = mutate(sheet);
  const saved = await documents().replace(sheetId, expectedRevision, sheet.title, blocks);
  invalidateDbSheetCache();
  return { sheetId, targetId, revision: saved.revision, changes };
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
    : await Promise.all((await documents().list()).map((s) => getOwnerSheet(s.sheetId)));
  const hits: ProjectSearchHit[] = [];

  for (const sheet of sheets) {
    for (const projectBlock of projectBlocks(sheet)) {
      const data = projectBlock.data;

      const companyById = new Map(data.companies.map((c) => [c.id, c]));

      for (const item of data.items) {
        if (item.title === query) {
          hits.push({
            sheetId: sheet.sheetId,
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
            sheetId: sheet.sheetId,
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
            sheetId: sheet.sheetId,
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
            sheetId: sheet.sheetId,
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
  expectedRevision: string;
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

  return mutateOwnerSheet(input.sheetId, input.expectedRevision, (sheet) => {
    const projectBlock = findProjectBlockByItemId(sheet, input.projectId);
    const item = projectBlock.data.items.find((i) => i.id === input.projectId) as ProjectItem;

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
    return { blocks: replaceBlockData(sheet.blocks, projectBlock.id, nextData), targetId: input.projectId, changes };
  });
}

/** update_company で更新可能なフィールド。 */
export type CompanyPatch = Partial<Pick<CompanyInfo, 'name' | 'kind' | 'period' | 'note' | 'hidden'>>;

const COMPANY_PATCHABLE_FIELDS = ['name', 'kind', 'period', 'note', 'hidden'] as const;

/** 会社 1 社の指定フィールドだけを更新する。1 回につき 1 会社。 */
export async function updateCompany(input: {
  sheetId: string;
  companyId: string;
  expectedRevision: string;
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

  return mutateOwnerSheet(input.sheetId, input.expectedRevision, (sheet) => {
    const projectBlock = findProjectBlockByCompanyId(sheet, input.companyId);
    const company = projectBlock.data.companies.find((c) => c.id === input.companyId) as CompanyInfo;

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
    return { blocks: replaceBlockData(sheet.blocks, projectBlock.id, nextData), targetId: input.companyId, changes };
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
  expectedRevision: string;
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

  return mutateOwnerSheet(input.sheetId, input.expectedRevision, (sheet) => {
    const statsBlock = findStatsBlockByIndex(sheet, input.index, input.expectedLabel);
    const target = statsBlock.data.items[input.index] as StatItem;

    const next: StatItem = { ...target };
    for (const key of patchKeys) {
      next[key] = input.fields[key] as string;
    }
    const changes = patchKeys
      .filter((key) => target[key] !== next[key])
      .map((field) => ({ field, before: target[field], after: next[field] }));

    const nextData = { items: statsBlock.data.items.map((i, idx) => (idx === input.index ? next : i)) };
    return {
      blocks: replaceBlockData(sheet.blocks, statsBlock.id, nextData),
      targetId: `stats:${input.index}`,
      changes,
    };
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
  expectedRevision: string;
  item: NewProjectItem;
}): Promise<SheetWriteResult> {
  return mutateOwnerSheet(input.sheetId, input.expectedRevision, (sheet) => {
    const companyId = input.item.companyId ?? '';
    // 会社指定がある場合はその会社が属するブロックへ追加する（別ブロックへ入れると
    // companyId の参照が切れる）。未指定なら先頭の project ブロックへ入れる。
    const projectBlock = companyId !== '' ? findProjectBlockByCompanyId(sheet, companyId) : projectBlocks(sheet)[0];
    if (!projectBlock) {
      throw new SheetServiceError('NOT_FOUND', 'project ブロックがシートに存在しません');
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
    return {
      blocks: replaceBlockData(sheet.blocks, projectBlock.id, nextData),
      targetId: newItem.id,
      changes: [{ field: 'items', before: null, after: newItem }],
    };
  });
}

/**
 * 案件の表示順を projectIds の並びで一括置換する。
 * 重複・欠落・未知 ID はすべて拒否する（部分適用すると事故時に順序が壊れるため、
 * 集合が既存と完全一致する場合のみ適用する）。
 */
export async function reorderProjectItems(input: {
  sheetId: string;
  expectedRevision: string;
  projectIds: string[];
}): Promise<SheetWriteResult> {
  return mutateOwnerSheet(input.sheetId, input.expectedRevision, (sheet) => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const id of input.projectIds) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    if (duplicates.length > 0) {
      throw new SheetServiceError('BAD_REQUEST', `projectIds に重複があります: ${duplicates.join(', ')}`);
    }

    // 並び替えはブロック単位の操作なので、指定 ID がどのブロックに属するかを特定する。
    const ownerBlockByItemId = new Map<string, RawDocumentBlock & { data: ProjectBlockData }>();
    for (const block of projectBlocks(sheet)) {
      for (const item of block.data.items) ownerBlockByItemId.set(item.id, block);
    }
    const unknownIds = input.projectIds.filter((id) => !ownerBlockByItemId.has(id));
    if (unknownIds.length > 0) {
      throw new SheetServiceError('BAD_REQUEST', `未知の案件 ID が含まれています: ${unknownIds.join(', ')}`);
    }

    const blocks = projectBlocks(sheet);
    const targetBlocks = new Set(input.projectIds.map((id) => ownerBlockByItemId.get(id) as (typeof blocks)[number]));
    if (targetBlocks.size > 1) {
      throw new SheetServiceError(
        'BAD_REQUEST',
        'projectIds が複数の project ブロックにまたがっています。並び替えはブロック単位で行ってください',
      );
    }
    const projectBlock = targetBlocks.size === 1 ? [...targetBlocks][0] : blocks[0];
    if (!projectBlock) {
      throw new SheetServiceError('NOT_FOUND', 'project ブロックがシートに存在しません');
    }

    const existingIds = projectBlock.data.items.map((i) => i.id);
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
    return {
      blocks: replaceBlockData(sheet.blocks, projectBlock.id, nextData),
      targetId: 'items',
      changes: orderChanged ? [{ field: 'items.order', before: existingIds, after: input.projectIds }] : [],
    };
  });
}
