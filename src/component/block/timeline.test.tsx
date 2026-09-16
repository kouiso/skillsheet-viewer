import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo, ProjectItem } from '@/db/block';

import { Timeline } from './timeline';

const EMPTY_TECH = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

function buildItem(overrides: Partial<ProjectItem>): ProjectItem {
  return {
    id: 'p1',
    companyId: 'c1',
    title: 'マッチングアプリの開発',
    scope: 'スコープ',
    period: '2025.11 — 現在',
    role: 'フルスタックエンジニア',
    team: '13 名',
    tech: EMPTY_TECH,
    process: [],
    duties: '',
    acquired: '',
    comment: '',
    ...overrides,
  };
}

describe('Timeline', () => {
  it('320px 幅では日付列を独立行に落とす（#150: min-w-[132px]がタイトル列を圧迫していた回帰防止）', () => {
    const companyMap = new Map<string, CompanyInfo>();
    render(<Timeline items={[buildItem({})]} companyMap={companyMap} activeTech={[]} />);

    const period = screen.getByText('2025.11〜現在');
    // 日付とタイトルの共通の親（flex コンテナ）が、狭幅ではまず縦積み（flex-col）で、
    // sm 以上でだけ横並び（sm:flex-row）に切り替わることを確認する。
    const row = period.closest('div');
    expect(row?.className).toContain('flex-col');
    expect(row?.className).toContain('sm:flex-row');
    // min-w-[132px] は sm 以上でのみ効かせる（狭幅では日付列がタイトル列を圧迫しない）。
    expect(period.className).not.toMatch(/(?<!sm:)min-w-\[132px\]/);
    expect(period.className).toContain('sm:min-w-[132px]');
  });

  it('案件がない場合は何も描画しない', () => {
    const { container } = render(<Timeline items={[]} companyMap={new Map()} activeTech={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('稼働月数（ビュートグル「稼働月数」に従う）', () => {
  const renderTimeline = (item: ProjectItem, showDuration?: boolean) =>
    render(<Timeline items={[item]} companyMap={new Map()} activeTech={[]} showDuration={showDuration} />);

  it('期間の右に「（Nヶ月）」を添える（案件カードと同じ表記、既定 ON）', () => {
    renderTimeline(buildItem({ period: '2025.01 — 2025.09' }));
    expect(screen.getByText('2025.01〜2025.09')).toBeInTheDocument();
    expect(screen.getByText('（9ヶ月）')).toBeInTheDocument();
  });

  it('showDuration=false なら期間だけを出して月数を添えない', () => {
    renderTimeline(buildItem({ period: '2025.01 — 2025.09' }), false);
    expect(screen.getByText('2025.01〜2025.09')).toBeInTheDocument();
    expect(screen.queryByText('（9ヶ月）')).not.toBeInTheDocument();
  });

  it('終端が「現在」なら月数ではなく「（継続中）」を出す', () => {
    renderTimeline(buildItem({ period: '2025.11 — 現在' }));
    expect(screen.getByText('（継続中）')).toBeInTheDocument();
  });

  it('月まで書かれていない期間は稼働月数を出さない（書いていない精度を足さない）', () => {
    renderTimeline(buildItem({ period: '2020 — 2021' }));
    // deriveDuration 素通しだと年だけの両端を数えて「1年1ヶ月」が出る。
    // 案件カード・PDF と同じ precise 判定で出さない。
    expect(screen.getByText('2020〜2021')).toBeInTheDocument();
    expect(screen.queryByText(/1年1ヶ月/)).not.toBeInTheDocument();
  });

  it('期間が空・解釈不能なら稼働月数も出さない（手入力の duration があっても期間無しでは出さない）', () => {
    renderTimeline(buildItem({ period: '', duration: '9ヶ月' }));
    expect(screen.getByText('(期間未入力)')).toBeInTheDocument();
    expect(screen.queryByText('（9ヶ月）')).not.toBeInTheDocument();
  });

  it('手入力の duration があれば導出値より優先する', () => {
    renderTimeline(buildItem({ period: '2025.01 — 2025.09', duration: '9ヶ月間' }));
    expect(screen.getByText('（9ヶ月間）')).toBeInTheDocument();
  });
});
