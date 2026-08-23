import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectBlockData, ProjectItem } from '@/db/blocks';

import { ProjectSection } from './project-section';

// framer-motion はアニメーション専用 props を除いた素の要素に置換する。
// Proxy の get トラップが毎回新しいコンポーネント関数を返すと、React はそれを
// 「別のコンポーネント型」とみなして <motion.section> 配下を再マウントしてしまう
// （state が変わるたびに検索入力がフォーカスごと作り直され、2文字目以降の入力が
// 効かなくなる回帰があった。本番の framer-motion は同じキーに対し安定した参照を
// 返すため実機では起きないが、このモックでは明示的にキャッシュする必要がある）。
vi.mock('framer-motion', () => {
  const cache = new Map<string | symbol, (props: { children?: ReactNode }) => ReactNode>();
  return {
    motion: new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (!cache.has(prop)) {
            const Passthrough = ({ children, ...props }: { children?: ReactNode }) => {
              const rest = { ...props } as Record<string, unknown>;
              for (const key of ['initial', 'animate', 'transition', 'whileHover', 'whileTap', 'exit', 'variants']) {
                delete rest[key];
              }
              return <div {...rest}>{children}</div>;
            };
            cache.set(prop, Passthrough);
          }
          return cache.get(prop);
        },
      },
    ),
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

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

describe('ProjectSection の会社グルーピング', () => {
  const TWO_COMPANY_DATA: ProjectBlockData = {
    companies: [
      { id: 'c1', name: 'A社', kind: '', period: '2024.01 — 2024.06', note: 'A社の概要文。' },
      { id: 'c2', name: 'B社', kind: '', period: '2023.01 — 2023.06', note: '' },
    ],
    items: [
      buildItem({ id: 'p1', companyId: 'c1', title: '案件A-1', duties: 'A社の1件目' }),
      buildItem({ id: 'p2', companyId: 'c1', title: '案件A-2', duties: 'A社の2件目' }),
      buildItem({ id: 'p3', companyId: 'c2', title: '案件B-1', duties: 'B社の1件目' }),
    ],
  };

  it('会社ごとに見出しが出て、data.companies の順で並ぶ', () => {
    render(<ProjectSection data={TWO_COMPANY_DATA} showProcess={false} showTimeline={false} />);
    const headings = screen.getAllByRole('heading', { level: 2, name: /A社|B社/ });
    expect(headings.map((h) => h.textContent)).toEqual(['A社', 'B社']);
  });

  it('会社概要文は会社セクションに1回だけ出る（同じ会社の案件が2件あっても重複しない）', () => {
    render(<ProjectSection data={TWO_COMPANY_DATA} showProcess={false} showTimeline={false} />);
    expect(screen.getAllByText('A社の概要文。')).toHaveLength(1);
  });

  it('検索で0件になった会社のセクションは見出しごと消える', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={TWO_COMPANY_DATA} showProcess={false} showTimeline={false} />);
    await user.type(screen.getByLabelText('案件・技術・役割を検索'), 'A社の1件目');
    expect(screen.getByRole('heading', { level: 2, name: 'A社' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'B社' })).not.toBeInTheDocument();
  });

  it('companies に無い companyId の案件は「(不明な会社)」としてまとまる', () => {
    const data: ProjectBlockData = {
      companies: [{ id: 'c1', name: 'A社', kind: '', period: '', note: '' }],
      items: [
        buildItem({ id: 'p1', companyId: 'c1', title: '案件A' }),
        buildItem({ id: 'p2', companyId: 'ghost', title: '案件不明' }),
      ],
    };
    render(<ProjectSection data={data} showProcess={false} showTimeline={false} />);
    expect(screen.getByRole('heading', { level: 2, name: '(不明な会社)' })).toBeInTheDocument();
    expect(screen.getByText('案件不明')).toBeInTheDocument();
  });

  it('会社から探すジャンプナビが会社ごとのリンクを出す', () => {
    render(<ProjectSection data={TWO_COMPANY_DATA} showProcess={false} showTimeline={false} />);
    expect(screen.getByRole('link', { name: /A社/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /B社/ })).toBeInTheDocument();
  });
});

describe('ProjectSection の検索（AND/OR・全角正規化）', () => {
  const DATA2: ProjectBlockData = {
    companies: [{ id: 'c1', name: 'Q 社', kind: '', period: '', note: '' }],
    items: [
      buildItem({
        id: 'p1',
        title: '案件A',
        summary: '決済基盤の開発',
        tech: { ...EMPTY_TECH, lang: ['TypeScript'] },
      }),
      buildItem({
        id: 'p2',
        title: '案件B',
        summary: '管理画面の改善',
        tech: { ...EMPTY_TECH, lang: ['Python'] },
      }),
    ],
  };

  it('スペース区切りは OR（どちらかの語を含めばヒット）', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={DATA2} showProcess={false} showTimeline={false} />);
    await user.type(screen.getByLabelText('案件・技術・役割を検索'), '決済基盤 管理画面');
    expect(screen.getByText('案件A')).toBeInTheDocument();
    expect(screen.getByText('案件B')).toBeInTheDocument();
  });

  it('AND を挟むとすべての語を含む案件だけに絞る', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={DATA2} showProcess={false} showTimeline={false} />);
    await user.type(screen.getByLabelText('案件・技術・役割を検索'), '決済基盤 AND 管理画面');
    expect(screen.queryByText('案件A')).not.toBeInTheDocument();
    expect(screen.queryByText('案件B')).not.toBeInTheDocument();
  });

  it('全角英数字でも半角データにヒットする（NFKC 正規化）', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={DATA2} showProcess={false} showTimeline={false} />);
    await user.type(screen.getByLabelText('案件・技術・役割を検索'), 'ＴｙｐｅＳｃｒｉｐｔ');
    expect(screen.getByText('案件A')).toBeInTheDocument();
    expect(screen.queryByText('案件B')).not.toBeInTheDocument();
  });
});
