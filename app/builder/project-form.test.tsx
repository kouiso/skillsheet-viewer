import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectItem } from '@/db/block';
import { ProjectForm } from './project-form';

const project: ProjectItem = {
  id: 'project-1',
  companyId: 'company-1',
  title: '案件',
  scope: '',
  period: '2024.01 — 2024.06',
  duration: ' 半年 ',
  role: '',
  team: '',
  tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
  process: [],
  duties: '',
  acquired: '',
  comment: '',
};

describe('案件の日付編集', () => {
  it('編集中の日付と原文の不一致を保存不能として表示する', () => {
    const item = { ...project, periodStart: '2024-08', periodEnd: '2024-06', ongoing: false };
    render(
      <ProjectForm
        project={item}
        data={{ companies: [], items: [item] }}
        onPatch={vi.fn()}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('一致していないため保存できません');
  });

  it('編集中の明示的な終了空欄を原文の終了月へ戻さない', () => {
    const item = { ...project, periodStart: '2024-01', periodEnd: '', ongoing: false };
    render(
      <ProjectForm
        project={item}
        data={{ companies: [], items: [item] }}
        onPatch={vi.fn()}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('終了月', { selector: 'input' })).toHaveValue('');
  });

  it.each([
    ['2024.01 — 2024.06', '2024-06', false],
    ['2024.01 — 現在', '', true],
  ] as const)('一部だけ存在する投影の不足値を原文%sから復元する', (period, end, ongoing) => {
    const onPatch = vi.fn();
    const item = { ...project, period, periodStart: '2024-01' };
    render(
      <ProjectForm
        project={item}
        data={{ companies: [], items: [item] }}
        onPatch={onPatch}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('終了月', { selector: 'input' })).toHaveValue(end);
    expect((screen.getByRole('checkbox', { name: '継続中' }) as HTMLInputElement).checked).toBe(ongoing);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it.each([' 半年 ', undefined])('終了月変更でduration %sを生成・上書きしない', (duration) => {
    const onPatch = vi.fn();
    const item = { ...project, duration };
    render(
      <ProjectForm
        project={item}
        data={{ companies: [], items: [item] }}
        onPatch={onPatch}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('終了月', { selector: 'input' }), { target: { value: '2024-12' } });
    expect(onPatch).toHaveBeenCalledWith({
      periodStart: '2024-01',
      periodEnd: '2024-12',
      ongoing: false,
      period: '2024.01 — 2024.12',
    });
    expect(item.duration).toBe(duration);
  });

  it('継続へ変更しても本人入力durationを更新パッチに含めない', () => {
    const onPatch = vi.fn();
    render(
      <ProjectForm
        project={project}
        data={{ companies: [], items: [project] }}
        onPatch={onPatch}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '継続中' }));
    expect(onPatch).toHaveBeenCalledWith({
      periodStart: '2024-01',
      periodEnd: '',
      ongoing: true,
      period: '2024.01 — 現在',
    });
    expect(project.duration).toBe(' 半年 ');
  });
});
