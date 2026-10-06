import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { StatsBlockData } from '@/db/block';
import { itemToBlockInput } from '../serialize';
import { StatsBlockEditor } from './stat-block-editor';

const initial: StatsBlockData = {
  items: [
    { value: '3.5', unit: '年', label: '検証経験' },
    { value: '10+', unit: '件', label: '合成項目' },
  ],
};

describe('StatsBlockEditor', () => {
  it('3つの欄を文字列のまま更新し、他の項目と保存契約を保持する', () => {
    const onChange = vi.fn();
    function Harness() {
      const [data, setData] = useState(initial);
      return (
        <StatsBlockEditor
          data={data}
          onChange={(next) => {
            setData(next);
            onChange(itemToBlockInput({ id: 'stats-fixture', type: 'stats', data: next }));
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: '統計項目1の数値' }), { target: { value: '4〜5' } });
    fireEvent.change(screen.getByRole('textbox', { name: '統計項目1の単位' }), { target: { value: '年間' } });
    fireEvent.change(screen.getByRole('textbox', { name: '統計項目1のラベル' }), { target: { value: '更新した項目' } });
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'stats',
      data: { items: [{ value: '4〜5', unit: '年間', label: '更新した項目' }, initial.items[1]] },
    });
    expect(initial.items[0].value).toBe('3.5');
  });

  it('途中の項目を削除して残った行を編集し、全削除後も空項目を追加できる', () => {
    const onChange = vi.fn();
    function Harness() {
      const [data, setData] = useState(initial);
      return (
        <StatsBlockEditor
          data={data}
          onChange={(next) => {
            setData(next);
            onChange(next);
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '統計項目1を削除' }));
    expect(screen.getByRole('textbox', { name: '統計項目1の数値' })).toHaveValue('10+');
    fireEvent.change(screen.getByRole('textbox', { name: '統計項目1のラベル' }), { target: { value: '残った項目' } });
    expect(onChange).toHaveBeenLastCalledWith({ items: [{ value: '10+', unit: '件', label: '残った項目' }] });
    fireEvent.click(screen.getByRole('button', { name: '統計項目1を削除' }));
    expect(onChange).toHaveBeenLastCalledWith({ items: [] });
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '項目を追加' }));
    expect(onChange).toHaveBeenLastCalledWith({ items: [{ value: '', unit: '', label: '' }] });
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
  });
});
