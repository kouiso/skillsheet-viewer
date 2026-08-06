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
});
