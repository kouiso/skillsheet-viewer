import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectItem, ProjectTech, StatsBlockData } from '@/db/block';
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
      // 保存時に種類が補われる（9語に当たらないラベルは自由入力）。
      data: {
        items: [
          { value: '4〜5', unit: '年間', label: '更新した項目', kind: 'free' },
          { ...initial.items[1], kind: 'free' },
        ],
      },
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

  describe('計算される項目の読み取り専用表示（#639）', () => {
    const EMPTY_TECH: ProjectTech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
    const project = (id: string, period: string): ProjectItem => ({
      id,
      companyId: 'c1',
      title: id,
      scope: '',
      period,
      role: '',
      team: '',
      tech: EMPTY_TECH,
      process: [],
      duties: '',
      acquired: '',
      comment: '',
    });
    // 2年分（重複なし）の架空の案件2件。
    const context = {
      projects: [project('p1', '2020.01 — 2020.12'), project('p2', '2021.01 — 2021.12')],
      referenceMonth: 2026 * 12 + 10,
    };
    const data: StatsBlockData = {
      items: [
        // 保存値(99)は捨てられ、案件から出した値が見える。ラベルを変えても種類で計算される。
        { value: '99', unit: '年', label: '歴', kind: 'experience' },
        { value: '99', unit: '件', label: '参画数', kind: 'projectCount' },
        { value: '5', unit: '社', label: '自由な項目', kind: 'free' },
      ],
    };

    it('計算される項目は数値欄が読み取り専用で、いまの値と「案件から自動で出します」が見える', () => {
      render(<StatsBlockEditor data={data} onChange={vi.fn()} context={context} />);
      const experience = screen.getByRole('textbox', { name: '統計項目1の数値' });
      const count = screen.getByRole('textbox', { name: '統計項目2の数値' });
      expect(experience).toHaveAttribute('readonly');
      expect(experience).toHaveValue('2');
      expect(count).toHaveAttribute('readonly');
      expect(count).toHaveValue('2');
      expect(screen.getAllByText('案件から自動で出します')).toHaveLength(2);
      expect(experience).toHaveAccessibleDescription('案件から自動で出します');
    });

    it('計算される項目は打っても変わらず、自由入力の項目は打てて説明も出ない', () => {
      const onChange = vi.fn();
      render(<StatsBlockEditor data={data} onChange={onChange} context={context} />);
      fireEvent.change(screen.getByRole('textbox', { name: '統計項目1の数値' }), { target: { value: '7' } });
      expect(onChange).not.toHaveBeenCalled();
      const free = screen.getByRole('textbox', { name: '統計項目3の数値' });
      expect(free).not.toHaveAttribute('readonly');
      fireEvent.change(free, { target: { value: '6' } });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText('案件から自動で出します')).toHaveLength(2);
    });

    it('計算しない組み合わせ（単位が年・月でない経験年数）は種類が経験年数でも打てる', () => {
      render(
        <StatsBlockEditor
          data={{ items: [{ value: '3', unit: '社', label: '経験', kind: 'experience' }] }}
          onChange={vi.fn()}
          context={context}
        />,
      );
      expect(screen.getByRole('textbox', { name: '統計項目1の数値' })).not.toHaveAttribute('readonly');
      expect(screen.queryByText('案件から自動で出します')).toBeNull();
    });

    it('種類が無い古いデータも、9語のラベルなら読み取り専用になる', () => {
      render(
        <StatsBlockEditor
          data={{ items: [{ value: '1', unit: '件', label: '案件数' }] }}
          onChange={vi.fn()}
          context={context}
        />,
      );
      expect(screen.getByRole('textbox', { name: '統計項目1の数値' })).toHaveAttribute('readonly');
    });
  });
});
