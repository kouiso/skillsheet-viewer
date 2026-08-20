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
  it('チーム人数は既に単位が付いていればそのまま出す（単位を二重に足さない）', () => {
    render(<ProjectCard item={buildItem({})} no={1} company={COMPANY} activeTech={[]} tech={[]} />);
    expect(screen.getByText(/13 名/)).toBeInTheDocument();
    expect(screen.queryByText(/名名/)).not.toBeInTheDocument();
  });

  it('チーム人数が単位なしの数値のみ（ビルダーのplaceholder「例：13」通りの入力）なら「名」を補う', () => {
    render(<ProjectCard item={buildItem({ team: '13' })} no={1} company={COMPANY} activeTech={[]} tech={[]} />);
    expect(screen.getByText(/13名/)).toBeInTheDocument();
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

  it('会社概要文（company.note）が読める（#139: 従来どこにも描画されなかった）', () => {
    const company: CompanyInfo = { ...COMPANY, note: '大手SIベンダーにて複数の先進的なプロジェクトに参画。' };
    render(<ProjectCard item={buildItem({})} no={1} company={company} activeTech={[]} tech={[]} />);
    expect(screen.getByText('大手SIベンダーにて複数の先進的なプロジェクトに参画。')).toBeInTheDocument();
  });

  it('会社概要文が無ければ何も描画しない', () => {
    render(<ProjectCard item={buildItem({})} no={1} company={COMPANY} activeTech={[]} tech={[]} />);
    // COMPANY.note は '' なので note 由来の要素は無い（他の空文字チェックとの区別のため件数で確認）。
    expect(screen.queryByText(/参画/)).not.toBeInTheDocument();
  });

  it('役割は会社・人数・期間と同じメタ行に1行で出る', () => {
    render(<ProjectCard item={buildItem({})} no={1} company={COMPANY} activeTech={[]} tech={[]} />);

    const metaLine = screen.getByText('役割').parentElement;
    expect(metaLine?.tagName).toBe('P');
    expect(metaLine).toHaveTextContent('フルスタックエンジニア · Q 社（自社サービス事業会社） · 13 名');
  });

  it('タイトルが長くても役割は独立要素にならない（右上ブロックに分離していた回帰の防止）', () => {
    // 旧実装はヘッダーを flex-wrap の2カラムにし、役割だけを右カラムの div に単独で置いていた。
    // タイトルが長い案件だけ右カラムが2行目へ落ち、役割の位置が案件ごとに変わっていた。
    // 「役割だけを持つ要素が存在しない」＝メタ行に畳まれている、が構造上の判定になる。
    const longTitle = '散らばったスキルシートを一枚に束ねる管理基盤の設計と実装、および配信経路の整理';
    render(<ProjectCard item={buildItem({ title: longTitle })} no={1} company={COMPANY} activeTech={[]} tech={[]} />);

    expect(screen.queryByText('フルスタックエンジニア')).not.toBeInTheDocument();
    expect(screen.getByText('役割').parentElement).toHaveTextContent(
      'フルスタックエンジニア · Q 社（自社サービス事業会社） · 13 名',
    );
  });

  it('役割が空なら「役割」ラベルを出さず、会社・人数・期間だけのメタ行にする', () => {
    render(<ProjectCard item={buildItem({ role: '' })} no={1} company={COMPANY} activeTech={[]} tech={[]} />);

    expect(screen.queryByText('役割')).not.toBeInTheDocument();
    expect(screen.getByText(/Q 社（自社サービス事業会社） · 13 名/)).toBeInTheDocument();
  });

  it('コメントは italic を使わない（#152 S-2: 和文長文が合成斜体になっていた）', () => {
    const comment = '長めのコメント本文がここに入ります。';
    render(<ProjectCard item={buildItem({ comment })} no={1} company={COMPANY} activeTech={[]} tech={[]} />);
    const commentText = screen.getByText(/長めのコメント本文/);
    // InlineMarkdown が p でラップするので、その祖先を辿って italic クラスが無いことを確認する。
    const wrapper = commentText.closest('div');
    expect(wrapper?.className).not.toContain('italic');
  });
});
