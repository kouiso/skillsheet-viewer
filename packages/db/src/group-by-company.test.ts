import { describe, expect, it } from 'vitest';
import type { CompanyInfo, ProjectItem } from './blocks';
import { companyDisplayName, groupProjectsByCompany, UNKNOWN_COMPANY_NAME } from './group-by-company';

const EMPTY_TECH = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

function company(overrides: Partial<CompanyInfo> & Pick<CompanyInfo, 'id' | 'name'>): CompanyInfo {
  return { kind: '', period: '', note: '', ...overrides };
}

function item(overrides: Partial<ProjectItem> & Pick<ProjectItem, 'id' | 'companyId'>): ProjectItem {
  return {
    title: overrides.title ?? overrides.id,
    scope: '',
    period: '',
    role: '',
    team: '',
    tech: EMPTY_TECH,
    process: [],
    duties: '',
    acquired: '',
    comment: '',
    ...overrides,
  };
}

describe('groupProjectsByCompany', () => {
  it('companies の順を正とし、同名でも id が違えばマージしない', () => {
    const companies = [company({ id: 'a1', name: '受託' }), company({ id: 'a2', name: '受託' })];
    const items = [item({ id: 'p1', companyId: 'a2' }), item({ id: 'p2', companyId: 'a1' })];
    const groups = groupProjectsByCompany(companies, items);
    expect(groups.map((g) => g.companyId)).toEqual(['a1', 'a2']);
    expect(groups[0].items.map((p) => p.id)).toEqual(['p2']);
    expect(groups[1].items.map((p) => p.id)).toEqual(['p1']);
  });

  it('未知の companyId は末尾へ、表示名は所属不明', () => {
    const companies = [company({ id: 'known', name: '既知' })];
    const items = [item({ id: 'orphan', companyId: 'ghost' }), item({ id: 'ok', companyId: 'known' })];
    const groups = groupProjectsByCompany(companies, items);
    expect(groups.map((g) => g.companyId)).toEqual(['known', 'ghost']);
    expect(groups[1].company).toBeUndefined();
    expect(companyDisplayName(groups[1].company)).toBe(UNKNOWN_COMPANY_NAME);
  });

  it('案件の無い会社も companies 順の位置を保つ（呼び出し側が 0 件を除外する）', () => {
    const companies = [company({ id: 'empty', name: '空' }), company({ id: 'has', name: '有' })];
    const items = [item({ id: 'p1', companyId: 'has' })];
    const groups = groupProjectsByCompany(companies, items);
    expect(groups[0].items).toEqual([]);
    expect(groups[1].items).toHaveLength(1);
  });
});
