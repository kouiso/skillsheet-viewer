import type { CompanyInfo, ProjectItem } from './blocks';

export const UNKNOWN_COMPANY_NAME = '所属不明';

export interface CompanyGroup<T extends { companyId: string } = ProjectItem> {
  companyId: string;
  company: CompanyInfo | undefined;
  items: T[];
}

/**
 * project-nav の byCompany と同じ規則。
 * companies 順を正とし、未知の companyId は末尾（items の初出順）。名前ではマージしない。
 */
export function groupProjectsByCompany<T extends { companyId: string }>(
  companies: CompanyInfo[],
  items: T[],
): CompanyGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const company of companies) map.set(company.id, []);
  for (const item of items) {
    const list = map.get(item.companyId);
    if (list) list.push(item);
    else map.set(item.companyId, [item]);
  }
  const companyMap = new Map(companies.map((company) => [company.id, company]));
  return [...map.entries()].map(([companyId, grouped]) => ({
    companyId,
    company: companyMap.get(companyId),
    items: grouped,
  }));
}

export function companyDisplayName(company: CompanyInfo | undefined): string {
  const name = company?.name?.trim();
  return name || UNKNOWN_COMPANY_NAME;
}
