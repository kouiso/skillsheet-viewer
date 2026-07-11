import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SelectOrCustom } from './select-or-custom';

describe('SelectOrCustom', () => {
  it('「その他」選択直後にonChangeで値が空になっても自由入力欄を表示し続ける（gemini-code-assist指摘の回帰防止）', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SelectOrCustom value="" options={['A', 'B']} onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__custom__' } });
    expect(onChange).toHaveBeenCalledWith('');

    // 親コンポーネントがonChange('')を反映してvalue=""で再描画しても、
    // 自由入力欄は消えない(isCustomModeで維持される)
    rerender(<SelectOrCustom value="" options={['A', 'B']} onChange={onChange} />);
    expect(screen.getByPlaceholderText('自由入力')).toBeInTheDocument();
  });

  it('選択肢に含まれる値を選ぶと自由入力欄は表示されない', () => {
    render(<SelectOrCustom value="A" options={['A', 'B']} onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText('自由入力')).not.toBeInTheDocument();
  });

  it('選択肢にない既存値が渡された場合は自由入力欄を表示する', () => {
    render(<SelectOrCustom value="カスタム値" options={['A', 'B']} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('自由入力')).toBeInTheDocument();
  });
});
