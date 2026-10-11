import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectEditor } from './project-editor';

vi.mock('./project-form', () => ({ CompanyBar: () => null, ProjectForm: () => <p>案件フォーム</p> }));
const data = { companies: [], items: [] };
afterEach(() => vi.restoreAllMocks());
describe('全ブロックワークスペース', () => {
  it('選択ブロックの編集とプレビューを差し替えても非案件データを案件として保存しない', () => {
    const change = vi.fn();
    render(
      <ProjectEditor
        data={data}
        onChange={change}
        showPreview
        workspace={{
          selectedBlockId: 'text',
          onProjectSelect: vi.fn(),
          editor: (
            <label>
              本文
              <input defaultValue="合成内容" />
            </label>
          ),
          preview: <p>合成プレビュー</p>,
          outlineBefore: <p>前のブロック</p>,
          outlineAfter: <p>後のブロック</p>,
        }}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: '本文' }), { target: { value: '変更後' } });
    expect(screen.getByText('合成プレビュー')).toBeInTheDocument();
    expect(screen.getByText('前のブロック')).toBeInTheDocument();
    expect(screen.getByText('後のブロック')).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });
  it('desktop列を隠していても狭幅previewへ切り替え、編集DOMの入力を保持する', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(max-width: 860px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const view = render(
      <ProjectEditor
        data={data}
        onChange={vi.fn()}
        showPreview={false}
        workspace={{
          selectedBlockId: 'text',
          onProjectSelect: vi.fn(),
          editor: (
            <label>
              本文
              <input defaultValue="保持する入力" />
            </label>
          ),
          preview: <p>全文preview</p>,
        }}
      />,
    );
    const input = screen.getByRole('textbox', { name: '本文' });
    fireEvent.change(input, { target: { value: '編集中の内容' } });
    fireEvent.click(screen.getByRole('button', { name: 'プレビュー', hidden: true }));
    expect(view.container.querySelector('.mobile-preview')).toBeInTheDocument();
    expect(screen.getByText('全文preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '編集', hidden: true }));
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('編集中の内容');
  });
});
