import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo } from '@/db/blocks';

import { buildCompanyJumpItems, CompanyJumpNav } from './company-jump-nav';

function company(overrides: Partial<CompanyInfo> & Pick<CompanyInfo, 'id' | 'name'>): CompanyInfo {
  return { kind: '', period: '', note: '', ...overrides };
}

describe('buildCompanyJumpItems / CompanyJumpNav', () => {
  it('同名2社には開始年月 qualifier が付き、1社だけの同名には付かない', () => {
    const dup = buildCompanyJumpItems([
      { companyId: 'a1', company: company({ id: 'a1', name: '受託', period: '2020.04 — 2022.03' }), count: 2 },
      { companyId: 'a2', company: company({ id: 'a2', name: '受託', period: '2023.01 — 現在' }), count: 1 },
    ]);
    expect(dup[0].qual).toBe('2020.04—');
    expect(dup[1].qual).toBe('2023.01—');

    const single = buildCompanyJumpItems([
      { companyId: 'a1', company: company({ id: 'a1', name: '受託', period: '2020.04 — 2022.03' }), count: 2 },
      { companyId: 'b1', company: company({ id: 'b1', name: '自社', period: '2018.01 — 2019.12' }), count: 1 },
    ]);
    expect(single[0].qual).toBe('');
    expect(single[1].qual).toBe('');
  });

  it('会社から探すナビに qualifier が出る', () => {
    render(
      <CompanyJumpNav
        groups={[
          { companyId: 'a1', company: company({ id: 'a1', name: '受託', period: '2020.04 — 2022.03' }), count: 2 },
          { companyId: 'a2', company: company({ id: 'a2', name: '受託', period: '2023.01 — 現在' }), count: 1 },
        ]}
      />,
    );
    expect(screen.getByText('会社から探す')).toBeInTheDocument();
    expect(screen.getByText('2020.04—')).toBeInTheDocument();
  });
});
