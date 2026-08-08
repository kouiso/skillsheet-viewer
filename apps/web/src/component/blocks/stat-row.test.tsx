import type { StatsBlockData } from '@skillsheet/db/blocks';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatRow } from './stat-row';

function buildData(): StatsBlockData {
  return {
    items: [
      { value: '5', unit: '年', label: '経験年数' },
      { value: '12', unit: '件', label: '案件数' },
    ],
  };
}

describe('StatRow', () => {
  it('SP は grid-cols-2、sm 以上で sm:grid-cols-4 が共存する（#190）', () => {
    const { container } = render(<StatRow data={buildData()} />);
    const grid = container.firstElementChild;
    expect(grid?.className).toContain('grid-cols-2');
    expect(grid?.className).toContain('sm:grid-cols-4');
  });

  it('mb-6 は sm: prefix 付きになっている（親の space-y と二重に空かないようにする）', () => {
    const { container } = render(<StatRow data={buildData()} />);
    const grid = container.firstElementChild;
    expect(grid?.className).not.toMatch(/(?<!sm:)mb-6/);
    expect(grid?.className).toContain('sm:mb-6');
  });

  it('数値は SP で text-[26px]、sm 以上で sm:text-[30px]', () => {
    const { container } = render(<StatRow data={buildData()} />);
    // nested unit span があるため getByText では特定できず、class で直接絞り込む
    const valueSpan = Array.from(container.querySelectorAll('span')).find((el) => el.className.includes('text-[26px]'));
    expect(valueSpan).toBeDefined();
    expect(valueSpan?.className).toContain('sm:text-[30px]');
  });
});
