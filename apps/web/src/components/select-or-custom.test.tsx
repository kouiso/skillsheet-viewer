import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SelectOrCustom } from './select-or-custom';

describe('SelectOrCustom', () => {
  it('「その他」選択直後にonChangeで値が空になっても自由入力欄を表示し続ける（gemini-code-assist指摘の回帰防止）', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SelectOrCustom label="習熟度" value="" options={['A', 'B']} onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__custom__' } });
    expect(onChange).toHaveBeenCalledWith('');

    // 親コンポーネントがonChange('')を反映してvalue=""で再描画しても、
    // 自由入力欄は消えない(isCustomModeで維持される)
    rerender(<SelectOrCustom label="習熟度" value="" options={['A', 'B']} onChange={onChange} />);
    expect(screen.getByPlaceholderText('自由入力')).toBeInTheDocument();
  });

  it('選択肢に含まれる値を選ぶと自由入力欄は表示されない', () => {
    render(<SelectOrCustom label="習熟度" value="A" options={['A', 'B']} onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText('自由入力')).not.toBeInTheDocument();
  });

  it('選択肢にない既存値が渡された場合は自由入力欄を表示する', () => {
    render(<SelectOrCustom label="習熟度" value="カスタム値" options={['A', 'B']} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('自由入力')).toBeInTheDocument();
  });

  it('keyなしで再利用された場合でも、カスタム値→既知値への切替でisCustomModeが残留しない（coderabbitai指摘の回帰防止）', () => {
    const { rerender } = render(
      <SelectOrCustom label="習熟度" value="会社Aのカスタム値" options={['正社員', '契約社員']} onChange={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText('自由入力')).toBeInTheDocument();

    // keyを変えずに別インスタンス相当のpropsへ差し替え（会社A→会社Bの切替を模す）
    rerender(<SelectOrCustom label="習熟度" value="正社員" options={['正社員', '契約社員']} onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText('自由入力')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('正社員');
  });
  // 同じ行の他の入力欄には aria-label があるのに、この欄だけ無名で
  // スクリーンリーダーが「コンボボックス」としか読めなかった（回帰防止）。
  it('選択欄と自由入力欄の両方に読み上げ用の名前が付く', () => {
    const { rerender } = render(
      <SelectOrCustom label="スキル1の習熟度" value="A" options={['A', 'B']} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('スキル1の習熟度')).toBeInTheDocument();

    rerender(<SelectOrCustom label="スキル1の習熟度" value="独自レベル" options={['A', 'B']} onChange={vi.fn()} />);
    expect(screen.getByLabelText('スキル1の習熟度（自由入力）')).toBeInTheDocument();
  });
});
