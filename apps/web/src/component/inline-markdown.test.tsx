import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InlineMarkdown } from './inline-markdown';

describe('InlineMarkdown', () => {
  // CommonMark の flanking 規則（強調記号の直前直後が空白/約物でないと強調と認識しない）は
  // 日本語の文章と噛み合わない。実データで確認された実例（PRレビュー指摘）:
  // 和文の直後に **強調** が続き、直後が句読点（。）だと強調と認識されず、
  // アスタリスクがそのまま画面に出てしまっていた。remarkCjkFriendly で解消する。
  it('和文に挟まれた **強調** も CJK flanking 規則で正しく <strong> になる（実データ由来の回帰確認）', () => {
    render(<InlineMarkdown content="ルーティング処理をすべて**.htaccess**で記載されていた。" />);
    const strong = screen.getByText('.htaccess');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('通常の（前後が空白の）強調も引き続き機能する', () => {
    render(<InlineMarkdown content="これは **重要** な情報です。" />);
    expect(screen.getByText('重要').tagName).toBe('STRONG');
  });

  it('リンクは周囲の地の文と区別できる見た目（下線・リンク色）を持つ（レビュー指摘: Tailwind preflightでリンクだと分からなくなっていた）', () => {
    render(<InlineMarkdown content="[公式サイト](https://example.com)を参照。" />);
    const link = screen.getByRole('link', { name: '公式サイト' });
    expect(link).toHaveClass('underline');
    expect(link).toHaveClass('text-primary-dark');
  });

  it('既定（linksTabbable未指定）ではリンクは通常通りTabでフォーカス可能', () => {
    render(<InlineMarkdown content="[公式サイト](https://example.com)を参照。" />);
    const link = screen.getByRole('link', { name: '公式サイト' });
    expect(link).not.toHaveAttribute('tabindex', '-1');
  });

  it('linksTabbable={false} のときリンクは tabIndex=-1 になる（レビュー指摘: roving-tabindexの親を持つ文脈でリンクが独立したTab停止点になっていた）', () => {
    render(<InlineMarkdown content="[公式サイト](https://example.com)を参照。" linksTabbable={false} />);
    const link = screen.getByRole('link', { name: '公式サイト' });
    expect(link).toHaveAttribute('tabindex', '-1');
  });

  it('画像記法（Markdown/生HTMLどちらも）は <img> を描画せず、altテキストのみ残す（レビュー指摘: これらのフィールドはこれまで素のテキストで、外部画像を埋め込む想定が無いため）', () => {
    render(<InlineMarkdown content="![説明テキスト](https://example.com/tracking.png)" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('説明テキスト')).toBeInTheDocument();
  });

  it('altが無い画像は何も描画しない', () => {
    const { container } = render(<InlineMarkdown content="![](https://example.com/tracking.png)" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});
