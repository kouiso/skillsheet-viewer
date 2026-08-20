import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkillMatrix } from './skill-matrix';

describe('SkillMatrix', () => {
  it('習熟度（★）をホバー無しで画面テキストとして表示する（issue #142）', () => {
    render(
      <SkillMatrix
        data={{
          category: '言語',
          skills: [
            { name: 'TypeScript', years: 5, level: '★★★' },
            { name: 'Python', years: 2, level: '★★☆' },
            { name: 'Go', years: 0, level: '★☆☆' },
          ],
        }}
      />,
    );

    expect(screen.getByText('★★★')).toBeInTheDocument();
    expect(screen.getByText('★★☆')).toBeInTheDocument();
    expect(screen.getByText('★☆☆')).toBeInTheDocument();
  });

  it('4列グリッド（名前 / 習熟度 / バー / 年数）で描画し、既存の年数表示を壊さない', () => {
    render(
      <SkillMatrix
        data={{
          category: '言語',
          skills: [{ name: 'TypeScript', years: 5, level: '★★★' }],
        }}
      />,
    );

    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    const row = screen.getByText('TypeScript').closest('div');
    expect(row?.className).toContain('grid-cols-[1fr_44px_84px_28px]');
  });
});
