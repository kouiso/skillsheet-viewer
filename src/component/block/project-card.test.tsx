import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ProjectItem } from '@/db/block';

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

  it('5ラベルを出し、役割・人数・期間の欠損はメタ行ごと出さない', () => {
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
    // #289: 役割が空の案件では「役割」ラベルを出さない。メタ行は全項目が空なら行ごと
    // 出ないため、欠損の — が残るのは期間バッジの1箇所だけになる。
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(screen.queryByText('役割')).not.toBeInTheDocument();
    expect(screen.queryByText('Q 社（自社サービス事業会社）')).not.toBeInTheDocument();
  });

  it('役割は会社・人数・期間と同じメタ行に1行で出る（#289/#290）', () => {
    // SBI の完成の定義どおり「役割 SE · D社 · 9名 · 9ヶ月」の並びを固定する。
    render(
      <ProjectCard
        item={buildItem({ role: 'SE', team: '9', period: '2025.01 — 2025.09' })}
        no={1}
        companyName="D社"
        activeTech={[]}
        tech={[]}
      />,
    );

    const metaLine = screen.getByText('役割').parentElement;
    expect(metaLine?.tagName).toBe('P');
    expect(metaLine).toHaveTextContent('SE · D社 · 9名 · 9ヶ月');
  });

  it('タイトルが長くても役割は独立要素にならない（位置が案件ごとに変わる回帰の防止）', () => {
    // 見出しの右枠・dl の別列など「役割だけを持つ要素」があると、タイトルや期間の
    // 長さで役割の位置がずれる。メタ行の1要素内に畳まれていることを構造で見る。
    const longTitle = '散らばったスキルシートを一枚に束ねる管理基盤の設計と実装、および配信経路の整理';
    render(
      <ProjectCard
        item={buildItem({ title: longTitle, role: 'SE' })}
        no={1}
        companyName="D社"
        activeTech={[]}
        tech={[]}
      />,
    );

    expect(screen.queryByText('SE')).not.toBeInTheDocument();
    expect(screen.getByText('役割').parentElement).toHaveTextContent('SE · D社 · 13 名 · 継続中');
  });

  it('役割が空なら「役割」ラベルを出さず、会社・人数・期間だけのメタ行にする', () => {
    render(<ProjectCard item={buildItem({ role: '' })} no={1} companyName="D社" activeTech={[]} tech={[]} />);

    expect(screen.queryByText('役割')).not.toBeInTheDocument();
    expect(screen.getByText(/D社 · 13 名 · 継続中/)).toBeInTheDocument();
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
