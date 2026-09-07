import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SkillsBlockEditor } from './skills-block-editor';

describe('SkillsBlockEditor', () => {
  it('推しを解除すると featured を未設定へ戻す', () => {
    const onChange = vi.fn();
    render(
      <SkillsBlockEditor
        category="言語"
        skills={[{ name: 'TypeScript', years: 3, level: '実務経験あり', featured: true }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'スキル1を推しにする' }));
    expect(onChange).toHaveBeenCalledWith('言語', [{ name: 'TypeScript', years: 3, level: '実務経験あり' }]);
  });
});
