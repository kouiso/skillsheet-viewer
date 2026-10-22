import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanyInfo } from '@/db/block';

import { buildCompanyJumpItems, CompanyJumpNav } from './company-jump-nav';

// jsdom には App Router の文脈が無い。usePathname() も useSearchParams() も null を返す。
// それだと href を組み立てる枝を一度も通らない。ページごとの値を差し込む。
const nav = vi.hoisted(() => ({
  pathname: null as string | null,
  search: null as URLSearchParams | null,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
}));

afterEach(() => {
  nav.pathname = null;
  nav.search = null;
});

function company(overrides: Partial<CompanyInfo> & Pick<CompanyInfo, 'id' | 'name'>): CompanyInfo {
  return { kind: '', period: '', note: '', ...overrides };
}

function withBaseHref(run: () => void) {
  // 本番と同じく <base href="<origin>/"> がある状態。"#…" だけの href はトップへ解決される。
  const base = document.createElement('base');
  base.href = `${window.location.origin}/`;
  document.head.prepend(base);
  try {
    run();
  } finally {
    base.remove();
    window.history.replaceState(null, '', '/');
  }
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
    withBaseHref(() => {
      window.history.replaceState(null, '', '/view/db/sheet-1');
      nav.pathname = '/view/db/sheet-1';
      render(<CompanyJumpNav groups={[{ companyId: 'c1', company: company({ id: 'c1', name: '自社' }), count: 1 }]} />);
      const chip = screen.getByRole('link', { name: /自社/ });
      const notPrevented = fireEvent.click(chip);
      expect(notPrevented, '既定の遷移（/#company-c1 への移動）が止まっていない').toBe(false);
      expect(window.location.pathname).toBe('/view/db/sheet-1');
      expect(window.location.hash).toBe('#company-c1');
    });
  });

  it('ビルダーで左クリックしても ?sheet= が残る', () => {
    withBaseHref(() => {
      window.history.replaceState(null, '', '/builder?sheet=s-42');
      nav.pathname = '/builder';
      nav.search = new URLSearchParams('sheet=s-42');
      render(<CompanyJumpNav groups={[{ companyId: 'c1', company: company({ id: 'c1', name: '自社' }), count: 1 }]} />);
      expect(fireEvent.click(screen.getByRole('link', { name: /自社/ }))).toBe(false);
      expect(window.location.pathname).toBe('/builder');
      expect(window.location.search).toBe('?sheet=s-42');
      expect(window.location.hash).toBe('#company-c1');
    });
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

describe('新しいタブで開くリンク先が同じシートを指す', () => {
  // 中クリックや Cmd+クリックではブラウザが <base href="/"> の下で解決した a.href を開く。
  // シートを選ぶ方法はページで違う。どのページでも a.href が今見ているシートの会社見出しを指すかを見る。
  const cases = [
    {
      page: '閲覧画面 /view/db/<id>（シートをパスで選ぶ）',
      pathname: '/view/db/sheet-1',
      search: '',
      suffix: undefined,
      expected: '/view/db/sheet-1#company-c1',
    },
    {
      page: 'ビルダーの版の履歴 /builder?sheet=<id>（シートをクエリで選ぶ）',
      pathname: '/builder',
      search: 'sheet=s-42',
      suffix: undefined,
      expected: '/builder?sheet=s-42#company-c1',
    },
    {
      page: '閲覧画面で 2 つ目の project ブロック（見出し id に接尾辞が付く）',
      pathname: '/view/db/sheet-1',
      search: '',
      suffix: '-b2',
      expected: '/view/db/sheet-1#company-c1-b2',
    },
  ];

  for (const { page, pathname, search, suffix, expected } of cases) {
    it(page, () => {
      withBaseHref(() => {
        nav.pathname = pathname;
        nav.search = new URLSearchParams(search);
        render(
          <CompanyJumpNav
            groups={[{ companyId: 'c1', company: company({ id: 'c1', name: '自社' }), count: 1 }]}
            headingIdSuffix={suffix}
          />,
        );
        const chip = screen.getByRole('link', { name: /自社/ });
        expect(chip.getAttribute('href')).toBe(expected);
        expect(chip).toHaveProperty('href', `${window.location.origin}${expected}`);
      });
    });
  }

  it('パスが取れない時はハッシュだけにする', () => {
    render(<CompanyJumpNav groups={[{ companyId: 'c1', company: company({ id: 'c1', name: '自社' }), count: 1 }]} />);
    expect(screen.getByRole('link', { name: /自社/ }).getAttribute('href')).toBe('#company-c1');
  });
});
