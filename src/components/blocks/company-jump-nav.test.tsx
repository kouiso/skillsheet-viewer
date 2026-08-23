import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo } from '@/db/blocks';

import { CompanyJumpNav, type JumpTarget } from './company-jump-nav';

const company = (overrides: Partial<CompanyInfo>): CompanyInfo => ({
  id: 'c1',
  name: '会社A',
  kind: '',
  period: '',
  note: '',
  ...overrides,
});

describe('CompanyJumpNav', () => {
  it('会社ごとにアンカーを1つ出す', () => {
    const targets: JumpTarget[] = [
      { id: 'co-0', company: company({ id: 'c1', name: 'A社' }), companyId: 'c1', itemCount: 2 },
      { id: 'co-1', company: company({ id: 'c2', name: 'B社' }), companyId: 'c2', itemCount: 1 },
    ];
    render(<CompanyJumpNav targets={targets} />);
    expect(screen.getByRole('link', { name: /A社/ })).toHaveAttribute('href', '#co-0');
    expect(screen.getByRole('link', { name: /B社/ })).toHaveAttribute('href', '#co-1');
  });

  it('同名会社（実データの「受託」×複数を想定）には開始年月を添えて区別する', () => {
    const targets: JumpTarget[] = [
      {
        id: 'co-0',
        company: company({ id: 'c1', name: '受託', period: '2023.10 — 2024.02' }),
        companyId: 'c1',
        itemCount: 1,
      },
      {
        id: 'co-1',
        company: company({ id: 'c2', name: '受託', period: '2023.07 — 2024.01' }),
        companyId: 'c2',
        itemCount: 1,
      },
    ];
    render(<CompanyJumpNav targets={targets} />);
    const links = screen.getAllByRole('link', { name: /受託/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('2023.10—');
    expect(links[1]).toHaveTextContent('2023.07—');
  });

  it('会社名が一意なら開始年月を出さない', () => {
    const targets: JumpTarget[] = [
      {
        id: 'co-0',
        company: company({ id: 'c1', name: 'A社', period: '2020.01 — 2020.12' }),
        companyId: 'c1',
        itemCount: 1,
      },
    ];
    render(<CompanyJumpNav targets={targets} />);
    expect(screen.getByRole('link', { name: /A社/ })).not.toHaveTextContent('2020.01—');
  });

  it('対象が0件なら何も描画しない', () => {
    const { container } = render(<CompanyJumpNav targets={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
