import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CompanyLane } from './company-lane';

describe('CompanyLane', () => {
  it('会社期間がパースできなければ何も描画しない', () => {
    const { container } = render(
      <CompanyLane companyPeriod="不明な期間" items={[{ no: 1, period: '2024.01', duration: '' }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('会社期間の中に案件の帯を配置する', () => {
    const { container } = render(
      <CompanyLane
        companyPeriod="2024.01 — 2024.12"
        items={[
          { no: 1, period: '2024.01 — 2024.06', duration: '6ヶ月' },
          { no: 2, period: '2024.07 — 2024.12', duration: '6ヶ月' },
        ]}
      />,
    );
    // 前半案件は左端(0%)から始まり、後半案件はおよそ中間(50%)から始まる。
    const bars = container.querySelectorAll('[style*="left"]');
    expect(bars).toHaveLength(2);
    const firstLeft = Number.parseFloat((bars[0] as HTMLElement).style.left);
    const secondLeft = Number.parseFloat((bars[1] as HTMLElement).style.left);
    expect(firstLeft).toBeCloseTo(0, 0);
    expect(secondLeft).toBeGreaterThan(40);
  });

  it('装飾用途のため aria-hidden を付ける（カード側に同じ番号がテキストで既に出ている）', () => {
    const { container } = render(
      <CompanyLane companyPeriod="2024.01 — 2024.12" items={[{ no: 1, period: '2024.01', duration: '' }]} />,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
