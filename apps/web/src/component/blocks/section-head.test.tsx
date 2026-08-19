import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionHead, sectionHeadId } from './section-head';

describe('SectionHead', () => {
  // 見出しに id が無いと ToC（DOM から h1..h6[id] を拾う実装）が
  // ダッシュボード型のシートで丸ごと出なくなる。
  it('kicker 由来の id を h2 に付ける', () => {
    render(<SectionHead kicker="Career Timeline" title="案件タイムライン" />);

    const heading = screen.getByRole('heading', { level: 2, name: '案件タイムライン' });
    expect(heading).toHaveAttribute('id', 'section-career-timeline');
  });

  it('id は英数字とハイフンだけになる', () => {
    expect(sectionHeadId('Process Coverage')).toBe('section-process-coverage');
    expect(sectionHeadId('Skill Matrix')).toBe('section-skill-matrix');
    expect(sectionHeadId('Projects')).toBe('section-projects');
  });

  it('right を渡すと右端に出る', () => {
    render(<SectionHead kicker="Projects" title="案件詳細" right="12 件" />);
    expect(screen.getByText('12 件')).toBeInTheDocument();
  });
});
