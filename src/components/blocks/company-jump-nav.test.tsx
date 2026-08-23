import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CompanyJumpNav', () => {
  it('会社ごとにジャンプ用のボタンを1つ出す', () => {
    const targets: JumpTarget[] = [
      { id: 'co-0', company: company({ id: 'c1', name: 'A社' }), companyId: 'c1', itemCount: 2 },
      { id: 'co-1', company: company({ id: 'c2', name: 'B社' }), companyId: 'c2', itemCount: 1 },
    ];
    render(<CompanyJumpNav targets={targets} />);
    expect(screen.getByRole('button', { name: /A社/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /B社/ })).toBeInTheDocument();
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
    const links = screen.getAllByRole('button', { name: /受託/ });
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
    expect(screen.getByRole('button', { name: /A社/ })).not.toHaveTextContent('2020.01—');
  });

  // app/layout.tsx が <base href="{origin}/"> を注入しているため、`href="#id"` は
  // 「現在のページ + ハッシュ」ではなく「オリジン直下 + ハッシュ」に解決される。
  // 実機ではこれで閲覧画面から / へ飛ばされ、シートを見失った。二度と戻さないための検査。
  it('ハッシュだけの <a> を使わない（<base> があるとページ外へ飛ぶ）', () => {
    const targets: JumpTarget[] = [
      { id: 'co-0', company: company({ id: 'c1', name: 'A社' }), companyId: 'c1', itemCount: 1 },
    ];
    const { container } = render(<CompanyJumpNav targets={targets} />);
    expect(container.querySelectorAll('a[href^="#"]')).toHaveLength(0);
  });

  it('押すと対象セクションへスクロールし、フォーカスもそこへ送る', async () => {
    const user = userEvent.setup();
    const section = document.createElement('section');
    section.id = 'co-0';
    section.tabIndex = -1;
    section.getBoundingClientRect = () => ({
      top: 640,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 640,
      toJSON: () => ({}),
    });
    document.body.appendChild(section);
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    const targets: JumpTarget[] = [
      { id: 'co-0', company: company({ id: 'c1', name: 'A社' }), companyId: 'c1', itemCount: 1 },
    ];
    render(<CompanyJumpNav targets={targets} />);
    await user.click(screen.getByRole('button', { name: /A社/ }));

    // SCROLL_OFFSET=80 ぶん手前で止める（sticky topbar に見出しが潜らないように）。
    expect(scrollTo).toHaveBeenCalledWith({ top: 560, behavior: 'smooth' });
    expect(document.activeElement).toBe(section);
  });

  it('対象が0件なら何も描画しない', () => {
    const { container } = render(<CompanyJumpNav targets={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
