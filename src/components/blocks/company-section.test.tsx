import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo } from '@/db/blocks';

import { CompanySection } from './company-section';

const company = (overrides: Partial<CompanyInfo>): CompanyInfo => ({
  id: 'c1',
  name: '株式会社az',
  kind: '',
  period: '',
  note: '',
  ...overrides,
});

describe('CompanySection', () => {
  it('会社概要文（note）を1回だけ描画する', () => {
    const c = company({ note: '自社サービスを開発する事業会社。' });
    render(
      <CompanySection id="co-0" company={c} totalCount={1} visibleCount={1} searching={false} laneItems={[]}>
        <div>card</div>
      </CompanySection>,
    );
    expect(screen.getAllByText('自社サービスを開発する事業会社。')).toHaveLength(1);
  });

  it('note が空なら何も描画しない', () => {
    const c = company({ note: '' });
    render(
      <CompanySection id="co-0" company={c} totalCount={1} visibleCount={1} searching={false} laneItems={[]}>
        <div>card</div>
      </CompanySection>,
    );
    expect(screen.queryByText(/事業会社/)).not.toBeInTheDocument();
  });

  it('期間が無い会社に「在籍」を出さない（通年等の嘘をつかない）', () => {
    const c = company({ period: '' });
    render(
      <CompanySection id="co-0" company={c} totalCount={1} visibleCount={1} searching={false} laneItems={[]}>
        <div>card</div>
      </CompanySection>,
    );
    expect(screen.queryByText(/在籍/)).not.toBeInTheDocument();
  });

  it('期間があれば「在籍 {period}（Nヶ月）」を出す', () => {
    const c = company({ period: '2020.06 — 2021.08' });
    render(
      <CompanySection id="co-0" company={c} totalCount={1} visibleCount={1} searching={false} laneItems={[]}>
        <div>card</div>
      </CompanySection>,
    );
    expect(screen.getByText(/在籍 2020.06 — 2021.08/)).toBeInTheDocument();
  });

  it('検索中は「一致 N / 案件 M 件」、非検索時は「案件 M 件」を出す', () => {
    const c = company({});
    const { rerender } = render(
      <CompanySection id="co-0" company={c} totalCount={3} visibleCount={1} searching={true} laneItems={[]}>
        <div>card</div>
      </CompanySection>,
    );
    expect(screen.getByText('一致 1 / 案件 3 件')).toBeInTheDocument();

    rerender(
      <CompanySection id="co-0" company={c} totalCount={3} visibleCount={3} searching={false} laneItems={[]}>
        <div>card</div>
      </CompanySection>,
    );
    expect(screen.getByText('案件 3 件')).toBeInTheDocument();
  });

  it('個人開発は在籍表記を出さない', () => {
    const c = company({ kind: '個人開発', period: '2020.06 — 2021.08' });
    render(
      <CompanySection id="co-0" company={c} totalCount={1} visibleCount={1} searching={false} laneItems={[]}>
        <div>card</div>
      </CompanySection>,
    );
    expect(screen.queryByText(/在籍/)).not.toBeInTheDocument();
  });

  it('会社が未登録（所属不明）のときは "(不明な会社)" を見出しに出す', () => {
    render(
      <CompanySection id="co-x" company={undefined} totalCount={1} visibleCount={1} searching={false} laneItems={[]}>
        <div>card</div>
      </CompanySection>,
    );
    expect(screen.getByRole('heading', { name: '(不明な会社)' })).toBeInTheDocument();
  });
});
