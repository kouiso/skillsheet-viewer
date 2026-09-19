import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo, ProjectItem } from '@/db/block';

import { CompanySection, companyCountLabel, companyTenureLabel } from './company-section';

const EMPTY_TECH = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

function company(overrides: Partial<CompanyInfo> & Pick<CompanyInfo, 'id' | 'name'>): CompanyInfo {
  return { kind: '', period: '', note: '', ...overrides };
}

function item(overrides: Partial<ProjectItem> & Pick<ProjectItem, 'id'>): ProjectItem {
  return {
    companyId: 'c1',
    title: '案件A',
    scope: '',
    period: '2020.04 — 2021.03',
    role: 'エンジニア',
    team: '5名',
    tech: EMPTY_TECH,
    process: [],
    duties: '',
    acquired: '',
    comment: '',
    ...overrides,
  };
}

describe('companyTenureLabel / companyCountLabel', () => {
  it('期間が無い会社に通年を書かない', () => {
    expect(companyTenureLabel('')).toBe('');
    expect(companyTenureLabel('   ')).toBe('');
  });

  it('検索時は一致 N / 案件 M 件、非検索時は案件 M 件', () => {
    expect(companyCountLabel(1, 3, true)).toBe('一致 1 / 案件 3 件');
    expect(companyCountLabel(3, 3, false)).toBe('案件 3 件');
  });
});

describe('CompanySection', () => {
  it('note は見出し側に1回、カード側には出ない。期間空なら通年が無い', () => {
    const note = '大手SIベンダーにて複数の先進的なプロジェクトに参画。';
    render(
      <CompanySection
        companyId="c1"
        company={company({ id: 'c1', name: 'Q社', note, period: '' })}
        items={[{ item: item({ id: 'p1', title: '案件A' }), no: 1, tech: [] }]}
        totalCount={1}
        isSearching={false}
        activeTech={[]}
        queryTerms={[]}
      />,
    );
    expect(screen.getAllByText(note)).toHaveLength(1);
    expect(screen.queryByText('通年')).not.toBeInTheDocument();
    expect(screen.getByText('案件 1 件')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Q社' }).parentElement).toHaveClass('sticky');
  });

  it('会社期間が空なら配下案件から導出して見出しとレーンへ渡す', () => {
    render(
      <CompanySection
        companyId="c1"
        company={company({ id: 'c1', name: '個人開発', period: '' })}
        items={[
          { item: item({ id: 'p1', period: '2018.02 — 2019.03' }), no: 1, tech: [] },
          { item: item({ id: 'p2', period: '2020.01 — 2021.02' }), no: 2, tech: [] },
        ]}
        totalCount={2}
        isSearching={false}
        activeTech={[]}
        queryTerms={[]}
      />,
    );
    expect(screen.getByText(/在籍 2018\.02〜2021\.02/)).toBeInTheDocument();
    expect(screen.getByText('2018.02')).toBeInTheDocument();
    expect(screen.getByText('2021.02')).toBeInTheDocument();
  });

  it('検索時の件数ラベルを出す', () => {
    render(
      <CompanySection
        companyId="c1"
        company={company({ id: 'c1', name: 'Q社', period: '2020.04 — 2021.03' })}
        items={[{ item: item({ id: 'p1' }), no: 1, tech: [] }]}
        totalCount={3}
        isSearching
        activeTech={[]}
        queryTerms={[]}
      />,
    );
    expect(screen.getByText('一致 1 / 案件 3 件')).toBeInTheDocument();
  });
});

describe('稼働月数（ビュートグル「稼働月数」に従う）', () => {
  const twoItems = () => [
    { item: item({ id: 'p1', period: '2018.02 — 2019.03' }), no: 1, tech: [] },
    { item: item({ id: 'p2', period: '2020.01 — 2021.02' }), no: 2, tech: [] },
  ];
  const renderSection = (showDuration?: boolean) =>
    render(
      <CompanySection
        companyId="c1"
        company={company({ id: 'c1', name: '個人開発', period: '' })}
        items={twoItems()}
        totalCount={2}
        isSearching={false}
        activeTech={[]}
        queryTerms={[]}
        showDuration={showDuration}
      />,
    );

  it('既定（ON）は在籍月数・レーン・カードの括弧書きを出す', () => {
    renderSection();
    // 在籍月数は resolveDuration と同じ「N年Nヶ月」形式（#354。旧「（37ヶ月）」表記は廃止）
    expect(screen.getByText('在籍 2018.02〜2021.02（3年1ヶ月）')).toBeInTheDocument();
    // レーン右端の月数欄（2 案件とも 1年2ヶ月）。
    expect(screen.getAllByText('1年2ヶ月')).toHaveLength(2);
    // カードのメタ行（役割・会社・人数・月数の1行、#289/#290 由来）にも月数が出る。
    // 役割は #355 で強調 span 化したため、メタ行 <p> の textContent で見る。
    expect(
      screen.getAllByText(
        (_, el) => el?.tagName === 'P' && /エンジニア · 個人開発 · 5名 · 1年2ヶ月/.test(el.textContent ?? ''),
      ),
    ).toHaveLength(2);
  });

  it('OFF なら在籍月数・レーン・カードの括弧書きを全部消す（月数系の注記が半端に残らない）', () => {
    renderSection(false);
    expect(screen.getByText('在籍 2018.02〜2021.02')).toBeInTheDocument();
    expect(screen.queryByText(/ヶ月/)).not.toBeInTheDocument();
  });
});

describe('レビュー指摘の回帰: 書いていない精度を足さない', () => {
  it('年だけの在籍期間に月数を付けない', () => {
    expect(companyTenureLabel('2020')).toBe('在籍 2020');
  });

  it('終了が未記載なら月数を付けない', () => {
    expect(companyTenureLabel('2020.06')).toBe('在籍 2020.06');
  });

  it('終端が「現在」なら月数を付けない（実行時の時計で変わるため）', () => {
    expect(companyTenureLabel('2020.06 — 現在')).not.toMatch(/ヶ月/);
  });

  it('開始も終了も月まで書かれていれば従来どおり月数を出す', () => {
    expect(companyTenureLabel('2020.01 — 2020.03')).toContain('（3ヶ月）');
  });
});
