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

describe('レビュー指摘の回帰: 解釈できない期間と終端「現在」', () => {
  const items = [
    { no: '01', period: '2020.01 — 2020.06', duration: '6ヶ月' },
    { no: '02', period: '2020.07 — 2020.12', duration: '6ヶ月' },
  ];

  it('期間を解釈できない案件はレーンに出さない（会社の全期間として描かない）', () => {
    const lane = buildCompanyLane('2020.01 — 2020.12', [...items, { no: '03', period: '不明', duration: '' }]);
    expect(lane?.rows.map((row) => row.no)).toEqual(['01', '02']);
  });

  it('解釈できる案件が 2 件未満ならレーンを出さない', () => {
    expect(buildCompanyLane('2020.01 — 2020.12', [items[0], { no: '02', period: '不明', duration: '' }])).toBeNull();
  });

  it('終端が「現在」でも、幅は案件側の最大終了月から決まる（実行時の時計に依存しない）', () => {
    const a = buildCompanyLane('2020.01 — 現在', items);
    const b = buildCompanyLane('2020.01 — 2020.12', items);
    expect(a?.rows).toEqual(b?.rows);
  });
});
