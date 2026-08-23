/**
 * 案件データを「会社ごと」にまとめる純粋関数。
 * app/builder/project-nav.tsx の byCompany（エディタのナビ）と同じ規則:
 * data.companies の並びを正とし、会社に属さない（companyId が companies に無い）
 * 案件は「所属不明」として末尾へまとめる。
 *
 * 閲覧側（project-section.tsx）はフィルタ後の `{ item, no, tech }` ラッパ配列を渡すため、
 * companyId を取り出す関数をジェネリックに受け取る。
 */

import type { CompanyInfo } from './index';

export interface CompanyGroup<T> {
  /** company が undefined のとき「所属不明」グループ（末尾に1つだけ生まれる）。 */
  company: CompanyInfo | undefined;
  companyId: string;
  items: T[];
}

/** 所属不明グループの companyId として使う固定値。実データの id とは衝突しない前提の予約語。 */
export const UNASSIGNED_COMPANY_ID = '__unassigned__';

export function groupByCompany<T>(
  companies: CompanyInfo[],
  items: T[],
  getCompanyId: (item: T) => string,
): CompanyGroup<T>[] {
  const order: CompanyGroup<T>[] = companies.map((company) => ({ company, companyId: company.id, items: [] }));
  const byId = new Map(order.map((group) => [group.companyId, group]));
  const unassigned: T[] = [];

  for (const item of items) {
    const companyId = getCompanyId(item);
    const group = byId.get(companyId);
    if (group) group.items.push(item);
    else unassigned.push(item);
  }

  if (unassigned.length > 0) {
    order.push({ company: undefined, companyId: UNASSIGNED_COMPANY_ID, items: unassigned });
  }
  return order;
}
