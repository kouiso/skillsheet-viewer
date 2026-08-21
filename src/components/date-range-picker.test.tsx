import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DateRangePicker } from './date-range-picker';

// DateTokenPicker はカレンダーPopoverを内包し実UIクリックが重いため、
// DateRangePicker自身の結合ロジック（区切り文字の付与判断）だけを検証する
// 単純なボタンにモックする。
vi.mock('./date-token-picker', () => ({
  DateTokenPicker: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (next: string) => void;
    placeholder: string;
  }) => (
    <button type="button" onClick={() => onChange('next')}>
      {placeholder}:{value}
    </button>
  ),
}));

describe('DateRangePicker', () => {
  it('区切りなしの単一トークン期間は、開始側だけ編集しても単一トークンのまま維持する（chatgpt-codex-connector指摘の回帰防止）', () => {
    const onChange = vi.fn();
    render(<DateRangePicker value="2020" onChange={onChange} />);

    fireEvent.click(screen.getByText('開始年月日:2020'));

    // "next〜"のような開放範囲へ勝手に変換されず、単一トークンのまま
    expect(onChange).toHaveBeenCalledWith('next');
  });

  it('既に範囲（〜あり）の期間は、開始側の編集で区切り文字を維持したまま結合する', () => {
    const onChange = vi.fn();
    render(<DateRangePicker value="2020〜2023" onChange={onChange} />);

    fireEvent.click(screen.getByText('開始年月日:2020'));

    expect(onChange).toHaveBeenCalledWith('next〜2023');
  });

  it('単一トークン期間でも、終了側を明示的に編集すれば範囲として結合する', () => {
    const onChange = vi.fn();
    render(<DateRangePicker value="2020" onChange={onChange} />);

    fireEvent.click(screen.getByText('終了年月日:'));

    expect(onChange).toHaveBeenCalledWith('2020〜next');
  });
});
