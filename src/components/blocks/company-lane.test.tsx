import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildCompanyLane, CompanyLane } from './company-lane';

describe('buildCompanyLane / CompanyLane', () => {
  const twoItems = [
    { no: '01', period: '2020.04 — 2021.03', duration: '1年' },
    { no: '02', period: '2021.04 — 2022.03', duration: '1年' },
  ];

  it('2件以上かつ会社期間が解釈できるときだけセグメントを返す', () => {
    const lane = buildCompanyLane('2020.04 — 2022.03', twoItems);
    expect(lane).not.toBeNull();
    expect(lane?.rows).toHaveLength(2);
    expect(lane?.startLabel).toBe('2020.04');
  });

  it('1件では描画しない', () => {
    expect(buildCompanyLane('2020.04 — 2022.03', twoItems.slice(0, 1))).toBeNull();
    const { container } = render(<CompanyLane companyPeriod="2020.04 — 2022.03" items={twoItems.slice(0, 1)} />);
    expect(container.firstChild).toBeNull();
  });

  it('会社期間が解釈できなければ描画しない', () => {
    expect(buildCompanyLane('在籍期間不明', twoItems)).toBeNull();
    render(<CompanyLane companyPeriod="在籍期間不明" items={twoItems} />);
    expect(screen.queryByText('01')).not.toBeInTheDocument();
  });
});
