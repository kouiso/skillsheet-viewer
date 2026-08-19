import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TechFilter } from './tech-filter';

const noop = {
  query: '',
  onQueryChange: vi.fn(),
  onToggle: vi.fn(),
  onClear: vi.fn(),
};

describe('TechFilter', () => {
  it('トグル状態を aria-pressed で通知する（スクリーンリーダー a11y 回帰防止）', () => {
    render(
      <TechFilter
        all={[
          { name: 'TypeScript', count: 3 },
          { name: 'React', count: 2 },
        ]}
        active={['TypeScript']}
        count={1}
        total={2}
        {...noop}
      />,
    );

    expect(screen.getByRole('button', { name: /TypeScript/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /React/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('1案件のみの技術は既定で隠し、展開ボタンで出す', async () => {
    const { rerender } = render(
      <TechFilter
        all={[
          { name: 'TypeScript', count: 3 },
          { name: 'OnlyOnce', count: 1 },
        ]}
        active={[]}
        count={3}
        total={3}
        {...noop}
      />,
    );

    expect(screen.queryByRole('button', { name: /OnlyOnce/ })).toBeNull();

    const expand = screen.getByRole('button', { name: /すべての技術を表示/ });
    expand.click();
    rerender(
      <TechFilter
        all={[
          { name: 'TypeScript', count: 3 },
          { name: 'OnlyOnce', count: 1 },
        ]}
        active={[]}
        count={3}
        total={3}
        {...noop}
      />,
    );

    expect(screen.getByRole('button', { name: /OnlyOnce/ })).toBeTruthy();
  });

  it('選択中の技術は1案件のみでも隠さない（隠れると解除できなくなるため）', () => {
    render(
      <TechFilter
        all={[
          { name: 'TypeScript', count: 3 },
          { name: 'OnlyOnce', count: 1 },
        ]}
        active={['OnlyOnce']}
        count={1}
        total={3}
        {...noop}
      />,
    );

    expect(screen.getByRole('button', { name: /OnlyOnce/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
