import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectCard } from './project-card';

const EMPTY_TECH = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

const COMPANY: CompanyInfo = {
  id: 'c1',
  name: 'Q 社（自社サービス事業会社）',
  kind: '',
  period: '',
  note: '',
};

function buildItem(overrides: Partial<ProjectItem>): ProjectItem {
  return {
    id: 'p1',
    companyId: 'c1',
    title: 'マッチングアプリの開発',
    scope: '',
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

describe('ProjectCard', () => {
  it('チーム人数はそのまま出す（単位を二重に足さない）', () => {
    render(<ProjectCard item={buildItem({})} no={1} company={COMPANY} activeTech={[]} tech={[]} />);
    expect(screen.getByText(/13 名/)).toBeInTheDocument();
    expect(screen.queryByText(/名名/)).not.toBeInTheDocument();
  });

  it('summary の "- " 箇条書きを <ul><li> として描画する（Markdown 未解釈だった回帰の防止）', () => {
    const summary = '- iOS / Android アプリの機能開発\n- バックエンドの機能実装';
    render(<ProjectCard item={buildItem({ summary })} no={1} company={COMPANY} activeTech={[]} tech={[]} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('iOS / Android アプリの機能開発');
  });

  it('comment の "**強調**" を太字要素として描画し、"**" を画面に残さない', () => {
    const comment = '**動かして**みないと気が済まない性格です。';
    render(<ProjectCard item={buildItem({ comment })} no={1} company={COMPANY} activeTech={[]} tech={[]} />);

    expect(screen.getByText('動かして', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('acquired の改行を保ったまま Markdown として描画する', () => {
    const acquired = '1行目\n2行目';
    render(<ProjectCard item={buildItem({ acquired })} no={1} company={COMPANY} activeTech={[]} tech={[]} />);

    expect(screen.getByText(/1行目/)).toBeInTheDocument();
    expect(screen.getByText(/2行目/)).toBeInTheDocument();
  });
});
