import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectItem } from '@/db/blocks';

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
    render(<ProjectCard item={buildItem({})} no={1} activeTech={[]} />);
    expect(screen.getByText(/13 名/)).toBeInTheDocument();
    expect(screen.queryByText(/名名/)).not.toBeInTheDocument();
  });

  it('チーム人数が単位なしの数値のみ（ビルダーのplaceholder「例：13」通りの入力）なら「名」を補う', () => {
    render(<ProjectCard item={buildItem({ team: '13' })} no={1} activeTech={[]} />);
    expect(screen.getByText(/13名/)).toBeInTheDocument();
  });

  it('チーム規模が未入力なら — で欠損を明示する', () => {
    render(<ProjectCard item={buildItem({ team: '' })} no={1} activeTech={[]} />);
    const dt = screen.getByText('チーム規模');
    expect(dt.nextElementSibling).toHaveTextContent('—');
  });

  it('summary の "- " 箇条書きを <ul><li> として描画する（Markdown 未解釈だった回帰の防止）', () => {
    const summary = '- iOS / Android アプリの機能開発\n- バックエンドの機能実装';
    render(<ProjectCard item={buildItem({ summary })} no={1} activeTech={[]} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('iOS / Android アプリの機能開発');
  });

  it('担当業務セクションにラベルが付く', () => {
    render(<ProjectCard item={buildItem({ duties: '要件整理から実装まで担当。' })} no={1} activeTech={[]} />);
    expect(screen.getByText('担当業務')).toBeInTheDocument();
  });

  it('comment の "**強調**" を太字要素として描画し、"**" を画面に残さない', () => {
    const comment = '**動かして**みないと気が済まない性格です。';
    render(<ProjectCard item={buildItem({ comment })} no={1} activeTech={[]} />);

    expect(screen.getByText('動かして', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('acquired の改行を保ったまま Markdown として描画する', () => {
    const acquired = '1行目\n2行目';
    render(<ProjectCard item={buildItem({ acquired })} no={1} activeTech={[]} />);

    expect(screen.getByText(/1行目/)).toBeInTheDocument();
    expect(screen.getByText(/2行目/)).toBeInTheDocument();
  });

  it('コメントが2段落以下なら「続きを読む」ボタンを出さない', () => {
    const comment = '1段落目です。\n\n2段落目です。';
    render(<ProjectCard item={buildItem({ comment })} no={1} activeTech={[]} />);
    expect(screen.queryByRole('button', { name: /続きを読む/ })).not.toBeInTheDocument();
  });

  it('コメントが3段落以上なら先頭2段落だけ見せ「続きを読む（残りN）」で全文を開く', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const comment = '1段落目。\n\n2段落目。\n\n3段落目。';
    render(<ProjectCard item={buildItem({ comment })} no={1} activeTech={[]} />);

    expect(screen.getByText('1段落目。')).toBeInTheDocument();
    expect(screen.queryByText('3段落目。')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: '続きを読む（残り 1）' });

    await user.click(toggle);
    expect(screen.getByText('3段落目。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument();
  });

  it('技術スタックは6バケットのラベル付きで出す', () => {
    const tech = { ...EMPTY_TECH, lang: ['TypeScript'], fw: ['Next.js'] };
    render(<ProjectCard item={buildItem({ tech })} no={1} activeTech={[]} />);
    expect(screen.getByText('使用言語')).toBeInTheDocument();
    expect(screen.getByText('フレームワーク・ライブラリ')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('本文の色はすべて foreground に統一し、muted-foreground を本文色として使わない（見づらさの原因2の再発防止）', () => {
    const summary = '要約テキスト。';
    render(<ProjectCard item={buildItem({ summary })} no={1} activeTech={[]} />);
    const body = screen.getByText('要約テキスト。');
    expect(body.className).not.toContain('text-muted-foreground');
  });
});
