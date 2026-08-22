import type { ProjectItem } from '@skillsheet/db/blocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ProjectCard } from './project-card';

const EMPTY_TECH = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };

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
  it('チーム人数は既に単位が付いていればそのまま出す（単位を二重に足さない）', () => {
    render(<ProjectCard item={buildItem({})} no={1} activeTech={[]} tech={[]} />);
    expect(screen.getByText(/13 名/)).toBeInTheDocument();
    expect(screen.queryByText(/名名/)).not.toBeInTheDocument();
  });

  it('チーム人数が単位なしの数値のみ（ビルダーのplaceholder「例：13」通りの入力）なら「名」を補う', () => {
    render(<ProjectCard item={buildItem({ team: '13' })} no={1} activeTech={[]} tech={[]} />);
    expect(screen.getByText(/13名/)).toBeInTheDocument();
  });

  it('summary の "- " 箇条書きを <ul><li> として描画する（Markdown 未解釈だった回帰の防止）', () => {
    const summary = '- iOS / Android アプリの機能開発\n- バックエンドの機能実装';
    render(<ProjectCard item={buildItem({ summary })} no={1} activeTech={[]} tech={[]} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('iOS / Android アプリの機能開発');
  });

  it('comment の "**強調**" を太字要素として描画し、"**" を画面に残さない', () => {
    const comment = '**動かして**みないと気が済まない性格です。';
    render(<ProjectCard item={buildItem({ comment })} no={1} activeTech={[]} tech={[]} />);

    expect(screen.getByText('動かして', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('acquired の改行を保ったまま Markdown として描画する', () => {
    const acquired = '1行目\n2行目';
    render(<ProjectCard item={buildItem({ acquired })} no={1} activeTech={[]} tech={[]} />);

    expect(screen.getByText(/1行目/)).toBeInTheDocument();
    expect(screen.getByText(/2行目/)).toBeInTheDocument();
  });

  it('コメントは italic を使わない（#152 S-2: 和文長文が合成斜体になっていた）', () => {
    const comment = '長めのコメント本文がここに入ります。';
    render(<ProjectCard item={buildItem({ comment })} no={1} activeTech={[]} tech={[]} />);
    const commentText = screen.getByText(/長めのコメント本文/);
    const wrapper = commentText.closest('div');
    expect(wrapper?.className).not.toContain('italic');
  });

  it('5ラベルと欠損 — を出し、会社名は出さない', () => {
    render(
      <ProjectCard
        item={buildItem({
          period: '',
          role: '',
          team: '',
          duties: '業務本文',
          acquired: 'スキル本文',
          comment: 'コメント本文',
          process: ['実装'],
          tech: { lang: ['TypeScript'], fw: [], db: [], infra: [], tools: [], collab: [] },
        })}
        no={1}
        activeTech={[]}
        tech={['TypeScript']}
      />,
    );
    expect(screen.getByText('担当業務')).toBeInTheDocument();
    expect(screen.getByText('習得スキル')).toBeInTheDocument();
    expect(screen.getByText('コメント')).toBeInTheDocument();
    expect(screen.getByText('担当工程')).toBeInTheDocument();
    expect(screen.getByText('技術スタック')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('Q 社（自社サービス事業会社）')).not.toBeInTheDocument();
  });

  it('コメント3段落なら既定は2段落＋続きを読む（残り 1）、展開後に3段落全部', async () => {
    const user = userEvent.setup();
    const comment = '一段落目です。\n\n二段落目です。\n\n三段落目です。';
    render(<ProjectCard item={buildItem({ comment })} no={1} activeTech={[]} tech={[]} />);
    expect(screen.getByText('一段落目です。')).toBeInTheDocument();
    expect(screen.getByText('二段落目です。')).toBeInTheDocument();
    expect(screen.queryByText('三段落目です。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '続きを読む（残り 1）' }));
    expect(screen.getByText('三段落目です。')).toBeInTheDocument();
  });

  it('技術6バケットのラベルを出す', () => {
    render(
      <ProjectCard
        item={buildItem({
          tech: {
            lang: ['TypeScript'],
            fw: ['React'],
            db: ['PostgreSQL'],
            infra: ['AWS'],
            tools: ['Git'],
            collab: ['Slack'],
          },
        })}
        no={1}
        activeTech={[]}
        tech={['TypeScript', 'React', 'PostgreSQL', 'AWS', 'Git', 'Slack']}
      />,
    );
    expect(screen.getByText('言語')).toBeInTheDocument();
    expect(screen.getByText('フレームワーク')).toBeInTheDocument();
    expect(screen.getByText('DB')).toBeInTheDocument();
    expect(screen.getByText('インフラ')).toBeInTheDocument();
    expect(screen.getByText('ツール')).toBeInTheDocument();
    expect(screen.getByText('コラボレーションツール')).toBeInTheDocument();
  });

  it('クエリ一致の技術チップは activeTech が空でも強調する', () => {
    render(
      <ProjectCard
        item={buildItem({ tech: { lang: ['TypeScript', 'Go'], fw: [], db: [], infra: [], tools: [], collab: [] } })}
        no={1}
        activeTech={[]}
        tech={['TypeScript', 'Go']}
        queryTerms={['typescript']}
      />,
    );
    const ts = screen.getByText('TypeScript');
    const go = screen.getByText('Go');
    expect(ts.className).toContain('hit');
    expect(go.className).not.toContain('hit');
  });
});
