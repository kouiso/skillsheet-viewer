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
    expect(screen.getByText('5年')).toBeInTheDocument();

    const row = screen.getByText('TypeScript').closest('div');
    expect(row?.className).toContain('grid-cols-[minmax(0,1fr)_44px_72px_64px]');
  });

  it('一致案件の重複月を除いて年月表示する', () => {
    render(
      <SkillMatrix
        data={{ category: 'フロントエンド', skills: [{ name: 'React Native', years: 1, level: '★★★' }] }}
        projectItems={[
          {
            id: 'p1',
            companyId: 'c1',
            title: '案件',
            scope: '',
            period: '2019.01 — 2025.12',
            role: '',
            team: '',
            tech: { lang: [], fw: ['React Native'], db: [], infra: [], tools: [], collab: [] },
            process: [],
            duties: '',
            acquired: '',
            comment: '',
          },
        ]}
      />,
    );
    expect(screen.getByText('7年0ヶ月')).toBeInTheDocument();
  });

  it('推しモードでは推しのスキル名と経験バーを強調するが、4列グリッドは維持する', () => {
    render(
      <SkillMatrix
        hasFeatured
        data={{
          category: '言語',
          skills: [
            { name: 'TypeScript', years: 5, level: '★★★', featured: true },
            { name: 'Python', years: 2, level: '★★☆' },
          ],
        }}
      />,
    );

    expect(screen.getByText('TypeScript')).toHaveClass('font-semibold', 'text-primary-dark');
    expect(screen.getByText('Python')).not.toHaveClass('font-semibold');
    expect(screen.getByText('TypeScript').closest('div')?.className).toContain('grid-cols-[minmax(0,1fr)_44px_72px_64px]');
  });
});
