import { describe, expect, it } from 'vitest';
import { groupByCompany, UNASSIGNED_COMPANY_ID } from './group-by-company';
import type { CompanyInfo } from './index';

const company = (overrides: Partial<CompanyInfo>): CompanyInfo => ({
  id: 'c1',
  name: '会社A',
  kind: '',
  period: '',
  note: '',
  ...overrides,
});

describe('groupByCompany', () => {
  it('data.companies の並び順でグループを返す', () => {
    const companies = [company({ id: 'c2', name: 'B' }), company({ id: 'c1', name: 'A' })];
    const items = [
      { id: 'p1', companyId: 'c1' },
      { id: 'p2', companyId: 'c2' },
    ];
    const groups = groupByCompany(companies, items, (i) => i.companyId);
    expect(groups.map((g) => g.companyId)).toEqual(['c2', 'c1']);
    expect(groups[0].items).toEqual([items[1]]);
    expect(groups[1].items).toEqual([items[0]]);
  });

  it('案件が0件の会社も空配列のグループとして残る（同名会社の分裂を潰さないため）', () => {
    const companies = [company({ id: 'c1' }), company({ id: 'c2', name: '受託' })];
    const groups = groupByCompany(companies, [], () => '');
    expect(groups).toHaveLength(2);
    expect(groups[1].items).toEqual([]);
  });

  it('同名の会社を companyId 単位で別グループのまま保つ（マージしない）', () => {
    const companies = [
      company({ id: 'c1', name: '受託', period: '2023.10 — 2024.02' }),
      company({ id: 'c2', name: '受託', period: '2023.07 — 2024.01' }),
    ];
    const items = [
      { id: 'p1', companyId: 'c1' },
      { id: 'p2', companyId: 'c2' },
    ];
    const groups = groupByCompany(companies, items, (i) => i.companyId);
    expect(groups).toHaveLength(2);
    expect(groups[0].company?.period).toBe('2023.10 — 2024.02');
    expect(groups[1].company?.period).toBe('2023.07 — 2024.01');
  });

  it('companies に無い companyId の案件は「所属不明」として末尾へまとめる', () => {
    const companies = [company({ id: 'c1' })];
    const items = [
      { id: 'p1', companyId: 'c1' },
      { id: 'p2', companyId: 'ghost' },
      { id: 'p3', companyId: 'ghost' },
    ];
    const groups = groupByCompany(companies, items, (i) => i.companyId);
    expect(groups).toHaveLength(2);
    expect(groups[1].companyId).toBe(UNASSIGNED_COMPANY_ID);
    expect(groups[1].company).toBeUndefined();
    expect(groups[1].items.map((i) => i.id)).toEqual(['p2', 'p3']);
  });

  it('所属不明の案件が無ければ末尾グループを作らない', () => {
    const companies = [company({ id: 'c1' })];
    const groups = groupByCompany(companies, [{ id: 'p1', companyId: 'c1' }], (i) => i.companyId);
    expect(groups).toHaveLength(1);
  });
});
