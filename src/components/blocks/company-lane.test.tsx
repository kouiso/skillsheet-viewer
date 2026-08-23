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

  // 会社期間の外から始まる案件（入力ミス／退職後も続いた案件）で end < start となり、
  // width: "-43.48%" という不正な CSS が出て帯が消えていた。
  it('会社期間の外にある案件でも left/width が 0〜100% に収まる', () => {
    const { container } = render(
      <CompanyLane
        companyPeriod="2024.01 — 2024.06"
        items={[
          { no: 1, period: '2025.01 — 2025.06', duration: '6ヶ月' },
          { no: 2, period: '2023.01 — 2023.06', duration: '6ヶ月' },
        ]}
      />,
    );
    const bars = Array.from(container.querySelectorAll('[style*="left"]')) as HTMLElement[];
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      const left = Number.parseFloat(bar.style.left);
      const width = Number.parseFloat(bar.style.width);
      expect(width).toBeGreaterThan(0);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + width).toBeLessThanOrEqual(100.01);
    }
  });

  it('案件の期間が読めないときは帯を描かない（在籍期間まるごとの帯にしない）', () => {
    const { container } = render(
      <CompanyLane
        companyPeriod="2024.01 — 2024.12"
        items={[
          { no: 1, period: '読めない期間', duration: '' },
          { no: 2, period: '2024.07 — 2024.12', duration: '6ヶ月' },
        ]}
      />,
    );
    expect(container.querySelectorAll('[style*="left"]')).toHaveLength(1);
  });

  it('装飾用途のため aria-hidden を付ける（カード側に同じ番号がテキストで既に出ている）', () => {
    const { container } = render(
      <CompanyLane companyPeriod="2024.01 — 2024.12" items={[{ no: 1, period: '2024.01', duration: '' }]} />,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
