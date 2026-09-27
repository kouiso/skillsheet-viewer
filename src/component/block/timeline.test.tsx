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
  it('320px 幅では日付列を独立行に落とす（#150 回帰防止）。sm 以上は共有グリッド列でタイトル左端を揃える（#393）', () => {
    const companyMap = new Map<string, CompanyInfo>();
    render(<Timeline items={[buildItem({})]} companyMap={companyMap} activeTech={[]} />);

    const period = screen.getByText('2025.11〜現在');
    // 日付とタイトルの共通の親（行コンテナ）は、狭幅では従来どおり縦積み（#150）。
    const row = period.closest('div');
    expect(row?.className).toContain('flex-col');
    // sm 以上は行が親グリッドの 2 列を subgrid で引き継ぐ。日付列は最長ラベルに合う
    // 全行共有の 1 トラックなので、タイトル列の左端が全行で一致する（#393）。
    expect(row?.className).toContain('sm:col-span-2');
    expect(row?.className).toContain('sm:grid');
    expect(row?.className).toContain('sm:grid-cols-subgrid');
    // 行の間隔は縦方向だけ。column-gap を行側に置くと subgrid の溝幅
    // （親の sm:gap-x-4 = 16px）を上書きして日付とタイトルの間が詰まる（#393 F2）。
    expect(row?.className).toContain('gap-y-1');
    expect(row?.className).not.toMatch(/\bgap-1\b/);
    // 親グリッドの日付トラックは最長ラベル幅・上限 280px の全行共有 1 列。
    // minmax(0,280px) は空きがあれば常に 280px まで伸びるため fit-content を使う。
    expect(row?.parentElement?.className).toContain('sm:grid-cols-[fit-content(280px)_minmax(0,1fr)]');
    // 日付ラベルはこの列内で折り返す（#150 の回帰防止と同じく狭幅側の圧迫を防ぐ）。
    expect(period.className).toContain('min-w-0');
    expect(period.className).toContain('break-words');
    // 行個別の最小幅（旧 sm:min-w-[132px]）を置くと列幅がラベル依存に戻るため置かない。
    expect(period.className).not.toContain('min-w-[132px]');
  });

  it('案件がない場合は何も描画しない', () => {
    const { container } = render(<Timeline items={[]} companyMap={new Map()} activeTech={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('稼働月数（ビュートグル「稼働月数」に従う）', () => {
  const renderTimeline = (item: ProjectItem, showDuration?: boolean, referenceMonth?: number) =>
    render(
      <Timeline
        items={[item]}
        companyMap={new Map()}
        activeTech={[]}
        showDuration={showDuration}
        referenceMonth={referenceMonth}
      />,
    );

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

  it('終端が「現在」なら固定基準月までの月数を出す（時計依存の「継続中」にしない）', () => {
    renderTimeline(buildItem({ period: '2025.11 — 現在' }), undefined, 2026 * 12 + 8);
    expect(screen.getByText('（11ヶ月）')).toBeInTheDocument();
  });

  it('終端が「現在」で基準月が未指定なら月数を推測せず「（未確定）」とする', () => {
    renderTimeline(buildItem({ period: '2025.11 — 現在' }));
    expect(screen.getByText('（未確定）')).toBeInTheDocument();
  });

  it('月まで書かれていない期間は月数を捏造せず「（未確定）」とする（書いていない精度を足さない）', () => {
    renderTimeline(buildItem({ period: '2020 — 2021' }));
    // deriveDuration 素通しだと年だけの両端を数えて「1年1ヶ月」が出る。
    // 案件カード・PDF と同じ precise 判定で月数を足さない。
    expect(screen.getByText('2020〜2021')).toBeInTheDocument();
    expect(screen.queryByText(/1年1ヶ月/)).not.toBeInTheDocument();
    expect(screen.getByText('（未確定）')).toBeInTheDocument();
  });

  it('期間が空でも手入力の duration があればカードと同じく稼働月数を出す', () => {
    renderTimeline(buildItem({ period: '', duration: '9ヶ月' }));
    expect(screen.getByText('(期間未入力)')).toBeInTheDocument();
    expect(screen.getByText('（9ヶ月）')).toBeInTheDocument();
  });

  it('手入力の duration があれば導出値より優先する', () => {
    renderTimeline(buildItem({ period: '2025.01 — 2025.09', duration: '9ヶ月間' }));
    expect(screen.getByText('（9ヶ月間）')).toBeInTheDocument();
  });
});
