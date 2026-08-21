import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo, ProjectItem } from '@/db/blocks';

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
