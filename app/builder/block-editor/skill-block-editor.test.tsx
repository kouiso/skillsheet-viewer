import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SKILL_FIELD_LABELS } from '../field-label';
import { SkillsBlockEditor } from './skill-block-editor';

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

    const checkbox = screen.getByRole('checkbox', { name: 'スキル1を推しにする' });
    const label = checkbox.closest('label');
    expect(label).not.toBeNull();
    fireEvent.click(label as HTMLLabelElement);
    expect(onChange).toHaveBeenCalledWith('言語', [{ name: 'TypeScript', years: 3, level: '実務経験あり' }]);
  });

  it('表の見出しは「スキル」「経験年数」「習熟度」「推し」で、差分と同じ対応表を読む', () => {
    render(<SkillsBlockEditor category="言語" skills={[]} onChange={vi.fn()} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'スキル',
      '経験年数',
      '習熟度',
      '推し',
      '',
    ]);
    expect(SKILL_FIELD_LABELS.name).toBe('スキル');
  });
});
