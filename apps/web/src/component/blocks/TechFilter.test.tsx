import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TechFilter } from './TechFilter';

describe('TechFilter', () => {
  it('トグル状態を aria-pressed で通知する（スクリーンリーダー a11y 回帰防止）', () => {
    render(
      <TechFilter
        all={['TypeScript', 'React']}
        active={['TypeScript']}
        query=""
        onQueryChange={vi.fn()}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        count={1}
        total={2}
      />,
    );

    expect(screen.getByRole('button', { name: 'TypeScript' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'React' })).toHaveAttribute('aria-pressed', 'false');
  });
});
