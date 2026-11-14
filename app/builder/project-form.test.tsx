import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectItem } from '@/db/block';
import { PROJECT_FIELD_LABELS, TECH_FIELD_LABELS } from './field-label';
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
  it.each([
    { periodStart: '2024-01' },
    { periodEnd: '2024-06' },
    { ongoing: false },
  ])('解釈できない期間原文と明示投影 %j の保存不能を欄内にも表示する', (projection) => {
    const item = { ...project, period: '数年前頃', ...projection };
    const onPatch = vi.fn();
    render(
      <ProjectForm
        project={item}
        data={{ companies: [], items: [item] }}
        onPatch={onPatch}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('一致していないため保存できません');
    expect(screen.getByRole('alert')).toHaveClass('err');
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('解釈できない期間でも投影未入力の原文だけなら保存不能にしない', () => {
    const item = { ...project, period: '数年前頃' };
    const onPatch = vi.fn();
    render(
      <ProjectForm
        project={item}
        data={{ companies: [], items: [item] }}
        onPatch={onPatch}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('旧形式の期間に終了月を先に入力して保存不可となる場合も欄内で案内する', () => {
    const item = { ...project, period: '数年前頃' };
    const onPatch = vi.fn();
    const props = { data: { companies: [], items: [item] }, onPatch, onMoveCompany: vi.fn(), onDelete: vi.fn() };
    const { rerender } = render(<ProjectForm {...props} project={item} />);
    fireEvent.change(screen.getByLabelText('終了月', { selector: 'input' }), { target: { value: '2024-06' } });
    const patch = onPatch.mock.calls[0][0];
    expect(patch).toEqual({ periodStart: '', periodEnd: '2024-06', ongoing: false });
    const edited = { ...item, ...patch };
    rerender(<ProjectForm {...props} project={edited} data={{ companies: [], items: [edited] }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('一致していないため保存できません');
    expect(edited.period).toBe('数年前頃');
  });

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
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

describe('案件フォームの確認案内', () => {
  it('未入力の案内から案件名へ移動し、入力データは変更しない', () => {
    const onPatch = vi.fn();
    const item = { ...project, title: '', period: '' };
    render(
      <ProjectForm
        project={item}
        data={{ companies: [], items: [item] }}
        onPatch={onPatch}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '確認する（案件タイトル）' }));
    expect(screen.getByLabelText('案件タイトル')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '確認する（期間）' }));
    expect(screen.getByLabelText('開始月', { selector: 'input' })).toHaveFocus();
    expect(onPatch).not.toHaveBeenCalled();
  });
  it('逆期間の確認先は終了月で、既存の保存不可案内も保つ', () => {
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
    fireEvent.click(screen.getByRole('button', { name: '確認する（期間）' }));
    expect(screen.getByLabelText('終了月', { selector: 'input' })).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('保存できません');
  });
});

describe('案件フォームの補足文（#637）', () => {
  const renderForm = () => {
    const item = { ...project, companyId: 'company-1' };
    return render(
      <ProjectForm
        project={item}
        data={{ companies: [{ id: 'company-1', name: 'A社', kind: '', period: '', note: '' }], items: [item] }}
        onPatch={vi.fn()}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
  };

  it('プログラム内部の項目名（companyId・company_id・tech.lang など）を画面に出さない', () => {
    const { container } = renderForm();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/company_?id/i);
    expect(text).not.toMatch(/tech\.(lang|fw|db|infra|tools|collab)/);
    // 案件の内部 ID も持ち主には意味が無い。
    expect(text).not.toContain(project.id);
  });

  it('所属会社の補足は、変えたときに何が起きるかを伝える', () => {
    renderForm();
    expect(screen.getByText('会社を変えると、この案件がその会社の下に移ります')).toBeInTheDocument();
  });

  it('技術スタックの各欄に、何を入れる欄かが分かる補足が付く', () => {
    renderForm();
    for (const hint of ['例：Java、TypeScript', '例：Spring、React', '例：MySQL、PostgreSQL', '例：AWS、Docker']) {
      expect(screen.getByText(hint)).toBeInTheDocument();
    }
  });
});

describe('項目名の対応表', () => {
  it('編集画面の項目名は、版の差分と共有する対応表の語そのもの', () => {
    render(
      <ProjectForm
        project={project}
        data={{ companies: [{ id: 'company-1', name: '株式会社A', kind: '', period: '', note: '' }], items: [project] }}
        onPatch={vi.fn()}
        onMoveCompany={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const shown = [
      'title',
      'scope',
      'companyId',
      'role',
      'period',
      'team',
      'duties',
      'acquired',
      'comment',
      'summary',
    ] as const;
    for (const key of shown) {
      // 概要だけは編集画面で「（任意）」を添える。語の本体は対応表と同じ。
      expect(
        screen.getAllByText(new RegExp(`^${PROJECT_FIELD_LABELS[key].replace(/[/]/g, '\\/')}`)).length,
      ).toBeGreaterThan(0);
    }
    for (const label of Object.values(TECH_FIELD_LABELS)) expect(screen.getByText(label)).toBeInTheDocument();
  });
});
