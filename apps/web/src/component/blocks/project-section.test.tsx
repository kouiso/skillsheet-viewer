import type { ProjectBlockData } from '@skillsheet/db/blocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ProjectSection } from './project-section';

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

  it('TechFilter コンボ（技術チップ）が残っている', async () => {
    const user = userEvent.setup();
    render(<ProjectSection data={DATA} showProcess={false} showTimeline={false} />);
    await user.click(screen.getByRole('button', { name: /すべての技術を表示/ }));
    expect(screen.getByRole('button', { name: /TypeScript/ })).toBeInTheDocument();
    expect(screen.getByText(/スペース区切りはどれかを含む案件/)).toBeInTheDocument();
  });
});
