import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TechFilter } from './tech-filter';

const noop = {
  query: '',
  onQueryChange: vi.fn(),
  onToggle: vi.fn(),
  onClear: vi.fn(),
};

const ALL = [
  { name: 'TypeScript', count: 3 },
  { name: 'React', count: 2 },
  { name: 'OnlyOnce', count: 1 },
];

describe('TechFilter', () => {
  it('未選択の技術チップは出さない（チップ雲を置かない）', () => {
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);

    expect(screen.queryByRole('button', { name: /TypeScript/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /すべての技術を表示/ })).toBeNull();
  });

  it('案件検索欄は技術選択と別に残る', () => {
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);

    expect(screen.getByPlaceholderText('案件・技術・役割を検索…')).toBeTruthy();
    expect(screen.getByLabelText('技術を選ぶ')).toBeTruthy();
  });

  it('技術選択に入力すると一致する技術が出る（1件だけの技術も含む）', async () => {
    const user = userEvent.setup();
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);

    await user.click(screen.getByLabelText('技術を選ぶ'));
    await user.type(screen.getByLabelText('技術を選ぶ'), 'Only');

    expect(screen.getByRole('option', { name: /OnlyOnce/ })).toBeTruthy();
  });

  it('選んだ技術はチップになり aria-pressed=true になる', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <TechFilter
        all={ALL}
        active={['TypeScript']}
        count={1}
        total={3}
        query=""
        onQueryChange={vi.fn()}
        onToggle={onToggle}
        onClear={vi.fn()}
      />,
    );

    const chip = screen.getByRole('button', { name: /TypeScript/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    await user.click(chip);
    expect(onToggle).toHaveBeenCalledWith('TypeScript');
  });
});
