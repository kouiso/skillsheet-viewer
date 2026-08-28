import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo, ProjectItem } from '@/db/blocks';

import { CompanySection, companyCountLabel, companyTenureLabel } from './company-section';

const EMPTY_TECH = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

function company(overrides: Partial<CompanyInfo> & Pick<CompanyInfo, 'id' | 'name'>): CompanyInfo {
  return { kind: '', period: '', note: '', ...overrides };
}

function item(overrides: Partial<ProjectItem> & Pick<ProjectItem, 'id'>): ProjectItem {
  return {
    companyId: 'c1',
    title: '案件A',
    scope: '',
    period: '2020.04 — 2021.03',
    role: 'エンジニア',
    team: '5名',
    tech: EMPTY_TECH,
    process: [],
    duties: '',
    acquired: '',
    comment: '',
    ...overrides,
  };
}

describe('companyTenureLabel / companyCountLabel', () => {
  it('期間が無い会社に通年を書かない', () => {
    expect(companyTenureLabel('')).toBe('');
    expect(companyTenureLabel('   ')).toBe('');
  });

  it('検索時は一致 N / 案件 M 件、非検索時は案件 M 件', () => {
    expect(companyCountLabel(1, 3, true)).toBe('一致 1 / 案件 3 件');
    expect(companyCountLabel(3, 3, false)).toBe('案件 3 件');
  });
});

describe('CompanySection', () => {
  it('note は見出し側に1回、カード側には出ない。期間空なら通年が無い', () => {
    const note = '大手SIベンダーにて複数の先進的なプロジェクトに参画。';
    render(
      <CompanySection
        companyId="c1"
        company={company({ id: 'c1', name: 'Q社', note, period: '' })}
        items={[{ item: item({ id: 'p1', title: '案件A' }), no: 1, tech: [] }]}
        totalCount={1}
        isSearching={false}
        activeTech={[]}
        queryTerms={[]}
      />,
    );
    expect(screen.getAllByText(note)).toHaveLength(1);
    expect(screen.queryByText('通年')).not.toBeInTheDocument();
    expect(screen.getByText('案件 1 件')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Q社' }).parentElement).toHaveClass('sticky');
  });

  it('検索時の件数ラベルを出す', () => {
    render(
      <CompanySection
        companyId="c1"
        company={company({ id: 'c1', name: 'Q社', period: '2020.04 — 2021.03' })}
        items={[{ item: item({ id: 'p1' }), no: 1, tech: [] }]}
        totalCount={3}
        isSearching
        activeTech={[]}
        queryTerms={[]}
      />,
    );
    expect(screen.getByText('一致 1 / 案件 3 件')).toBeInTheDocument();
  });
});
