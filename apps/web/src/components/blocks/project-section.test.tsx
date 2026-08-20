import type { ProjectBlockData, ProjectItem } from '@skillsheet/db/blocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectSection } from './project-section';

// framer-motion はアニメーション専用 props を除いた素の要素に置換する
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        const Passthrough = ({ children, ...props }: { children?: ReactNode }) => {
          const rest = { ...props } as Record<string, unknown>;
          for (const key of ['initial', 'animate', 'transition', 'whileHover', 'whileTap', 'exit', 'variants']) {
            delete rest[key];
          }
          return <div {...rest}>{children}</div>;
        };
        return Passthrough;
      },
    },
  ),
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

const EMPTY_TECH = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

function buildItem(overrides: Partial<ProjectItem>): ProjectItem {
  return {
    id: 'p1',
    companyId: 'c1',
    title: '案件A',
    scope: '',
    period: '2025.01 — 2025.06',
    role: 'エンジニア',
    team: '5',
    tech: EMPTY_TECH,
    process: [],
    duties: '',
    acquired: '',
    comment: '',
    ...overrides,
  };
}

// summary が空文字の案件。カードには duties が出るので、その語で検索できなければ
// 「見えているのに探せない」状態になる。
const DATA: ProjectBlockData = {
  companies: [{ id: 'c1', name: 'Q 社', kind: '', period: '', note: '' }],
  items: [
    buildItem({ id: 'p1', title: '案件A', summary: '', duties: '決済基盤のリプレイス' }),
    buildItem({ id: 'p2', title: '案件B', summary: '社内向け管理画面の改善', duties: '' }),
  ],
};

describe('ProjectSection の検索', () => {
  it('summary が空文字でも、カードに出ている duties の語で絞り込める', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={DATA} showProcess={false} showTimeline={false} />);

    // 前提: 検索前は両方見えている。
    expect(screen.getByText('案件A')).toBeInTheDocument();
    expect(screen.getByText('案件B')).toBeInTheDocument();

    await user.type(screen.getByLabelText('案件・技術・役割を検索'), '決済基盤');

    expect(screen.getByText('案件A')).toBeInTheDocument();
    expect(screen.queryByText('案件B')).not.toBeInTheDocument();
  });

  it('summary が入っている案件は従来どおり summary の語で絞り込める', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={DATA} showProcess={false} showTimeline={false} />);

    await user.type(screen.getByLabelText('案件・技術・役割を検索'), '管理画面');

    expect(screen.getByText('案件B')).toBeInTheDocument();
    expect(screen.queryByText('案件A')).not.toBeInTheDocument();
  });
});

describe('ProjectSection のレイアウト', () => {
  it('案件カードは1列に並べる（多列だとカード1枚が窄まって本文が読めない）', () => {
    const { container } = render(<ProjectSection data={DATA} showProcess={false} showTimeline={false} />);

    const cards = container.querySelectorAll('article');
    expect(cards).toHaveLength(2);

    // カードの親がカード列の grid。ブレークポイント付きの多列指定が復活していないかも見る。
    const grid = cards[0]?.parentElement;
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).not.toMatch(/grid-cols-[2-9]/);
  });
});
