import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo } from '@/db/block';

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

describe('レビュー指摘の回帰: 見出し id の名前空間', () => {
  it('接尾辞を渡すとジャンプ先の id にも同じ接尾辞が付く', () => {
    const [item] = buildCompanyJumpItems([{ companyId: 'c1', company: undefined, count: 1 }], '-2');
    expect(item.href).toBe('#company-c1-2');
  });
});

describe('ページ内ジャンプが閲覧画面を離れない', () => {
  it('左クリックは既定の遷移を止めて、このページのハッシュだけを変える', () => {
    // 本番と同じく <base href="<origin>/"> がある状態。"#…" だけの href はトップへ解決される。
    const base = document.createElement('base');
    base.href = `${window.location.origin}/`;
    document.head.prepend(base);
    try {
      window.history.replaceState(null, '', '/view/db/sheet-1');
      render(<CompanyJumpNav groups={[{ companyId: 'c1', company: company({ id: 'c1', name: '自社' }), count: 1 }]} />);
      const chip = screen.getByRole('link', { name: /自社/ });
      const notPrevented = fireEvent.click(chip);
      expect(notPrevented, '既定の遷移（/#company-c1 への移動）が止まっていない').toBe(false);
      expect(window.location.pathname).toBe('/view/db/sheet-1');
      expect(window.location.hash).toBe('#company-c1');
    } finally {
      base.remove();
      window.history.replaceState(null, '', '/');
    }
  });

  it('修飾キー付きのクリックはブラウザに任せる', () => {
    render(<CompanyJumpNav groups={[{ companyId: 'c2', company: company({ id: 'c2', name: '受託' }), count: 1 }]} />);
    try {
      expect(fireEvent.click(screen.getByRole('link', { name: /受託/ }), { metaKey: true })).toBe(true);
    } finally {
      // jsdom はハッシュだけのリンクを辿るので、次の試験へハッシュを持ち越さない。
      window.history.replaceState(null, '', '/');
    }
  });
});
