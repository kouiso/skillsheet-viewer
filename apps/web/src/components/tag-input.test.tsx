import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagInput } from './tag-input';

describe('TagInput', () => {
  it('tagsがundefinedでもクラッシュせずプレースホルダーを表示する（gemini-code-assist指摘の回帰防止）', () => {
    render(<TagInput tags={undefined as unknown as string[]} onChange={vi.fn()} placeholder="タグを入力" />);
    expect(screen.getByPlaceholderText('タグを入力')).toBeInTheDocument();
  });

  it('tagsが渡された場合は各タグを表示する', () => {
    render(<TagInput tags={['React', 'TypeScript']} onChange={vi.fn()} />);
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });
});
