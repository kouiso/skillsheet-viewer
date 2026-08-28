import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectBlockData, ProjectItem } from '@/db/blocks';

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

const DATA: ProjectBlockData = {
  companies: [
    { id: 'a1', name: '受託', kind: '客先常駐', period: '2020.04 — 2022.03', note: '最初の受託メモ' },
    { id: 'a2', name: '受託', kind: '業務委託', period: '2023.01 — 現在', note: '二回目の受託メモ' },
    { id: 'empty-period', name: '個人開発', kind: '', period: '', note: '' },
  ],
  items: [
    {
      id: 'p1',
      companyId: 'a1',
      title: '受託案件1',
      scope: '',
      period: '2020.04 — 2021.03',
      role: 'エンジニア',
      team: '5名',
      tech: { ...EMPTY_TECH, lang: ['TypeScript'] },
      process: ['実装'],
      duties: 'React の実装',
      acquired: '',
      comment: '',
    },
    {
      id: 'p2',
      companyId: 'a2',
      title: '受託案件2',
      scope: '',
      period: '2023.01 — 現在',
      role: 'リード',
      team: '3名',
      tech: { ...EMPTY_TECH, fw: ['Vue'] },
      process: [],
      duties: 'Vue の実装',
      acquired: '',
      comment: '',
    },
    {
      id: 'p3',
      companyId: 'ghost',
      title: '所属不明の案件',
      scope: '',
      period: '2018.01 — 2018.12',
      role: '',
      team: '',
      tech: EMPTY_TECH,
      process: [],
      duties: '',
      acquired: '',
      comment: '',
    },
    {
      id: 'p4',
      companyId: 'empty-period',
      title: '通年と書いてはいけない案件',
      scope: '',
      period: '2024.01 — 2024.06',
      role: '',
      team: '',
      tech: EMPTY_TECH,
      process: [],
      duties: '',
      acquired: '',
      comment: '',
    },
  ],
};

describe('ProjectSection', () => {
  it('同名別 id は2ブロックのまま、所属不明は末尾、note はカードに出ない', () => {
    render(<ProjectSection data={DATA} showProcess={false} showTimeline={false} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    const names = headings.map((node) => node.textContent);
    expect(names.filter((n) => n === '受託')).toHaveLength(2);
    expect(names[names.length - 1]).toBe('所属不明');
    expect(screen.getByText('最初の受託メモ')).toBeInTheDocument();
    expect(screen.getByText('二回目の受託メモ')).toBeInTheDocument();
    expect(screen.queryByText('通年')).not.toBeInTheDocument();
  });

  it('検索0件の会社はセクションごと出さない', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={DATA} showProcess={false} showTimeline={false} />);
    await user.type(screen.getByLabelText('案件・技術・役割を検索'), 'Vue');
    expect(screen.getByText('受託案件2')).toBeInTheDocument();
    expect(screen.queryByText('受託案件1')).not.toBeInTheDocument();
    expect(screen.queryByText('所属不明の案件')).not.toBeInTheDocument();
    expect(screen.getByText('一致 1 / 案件 1 件')).toBeInTheDocument();
  });

  // TechFilter は検索選択（コンボボックス）に変わり、チップ雲は出さなくなった（#247）。
  // 会社別グルーピングと組み合わせても技術選択が機能することだけを確認する。
  it('技術の検索選択（コンボボックス）が会社別グルーピングと共存する', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={DATA} showProcess={false} showTimeline={false} />);
    await user.click(screen.getByLabelText('技術を選ぶ'));
    await user.click(screen.getByRole('option', { name: /TypeScript/ }));
    expect(screen.getByText('受託案件1')).toBeInTheDocument();
    expect(screen.queryByText('受託案件2')).not.toBeInTheDocument();
  });
});

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
const SEARCH_DATA: ProjectBlockData = {
  companies: [{ id: 'c1', name: 'Q 社', kind: '', period: '', note: '' }],
  items: [
    buildItem({ id: 'p1', title: '案件A', summary: '', duties: '決済基盤のリプレイス' }),
    buildItem({ id: 'p2', title: '案件B', summary: '社内向け管理画面の改善', duties: '' }),
  ],
};

describe('ProjectSection の検索', () => {
  it('summary が空文字でも、カードに出ている duties の語で絞り込める', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={SEARCH_DATA} showProcess={false} showTimeline={false} />);

    // 前提: 検索前は両方見えている。
    expect(screen.getByText('案件A')).toBeInTheDocument();
    expect(screen.getByText('案件B')).toBeInTheDocument();

    await user.type(screen.getByLabelText('案件・技術・役割を検索'), '決済基盤');

    expect(screen.getByText('案件A')).toBeInTheDocument();
    expect(screen.queryByText('案件B')).not.toBeInTheDocument();
  });

  it('summary が入っている案件は従来どおり summary の語で絞り込める', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={SEARCH_DATA} showProcess={false} showTimeline={false} />);

    await user.type(screen.getByLabelText('案件・技術・役割を検索'), '管理画面');

    expect(screen.getByText('案件B')).toBeInTheDocument();
    expect(screen.queryByText('案件A')).not.toBeInTheDocument();
  });
});
