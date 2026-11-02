// Next.js側の入口。Workerはsheet-service-coreのfactoryを直接利用する。
import 'server-only';
import { revalidateTag } from 'next/cache';
import { getOwnerId } from '../db/skillsheet';
import { getDocumentDb } from './d1-runtime';
import { createSheetService, type SheetService } from './sheet-service-core';

export * from './sheet-service-core';

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

function service(): SheetService {
  return createSheetService(getDocumentDb(), getOwnerId(), invalidateDbSheetCache);
}

export const listOwnerSheets: SheetService['listOwnerSheets'] = (...args) => service().listOwnerSheets(...args);
export const getOwnerSheet: SheetService['getOwnerSheet'] = (...args) => service().getOwnerSheet(...args);
export const searchProjects: SheetService['searchProjects'] = (...args) => service().searchProjects(...args);
export const updateProjectItem: SheetService['updateProjectItem'] = (...args) => service().updateProjectItem(...args);
export const updateCompany: SheetService['updateCompany'] = (...args) => service().updateCompany(...args);
export const updateStatsItem: SheetService['updateStatsItem'] = (...args) => service().updateStatsItem(...args);
export const addProjectItem: SheetService['addProjectItem'] = (...args) => service().addProjectItem(...args);
export const reorderProjectItems: SheetService['reorderProjectItems'] = (...args) =>
  service().reorderProjectItems(...args);
