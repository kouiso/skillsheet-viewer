import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceTopbar } from './workspace-topbar';

const props = () => ({
  sheets: [
    { id: 'one', title: '合成シート', updatedAt: new Date('2026-10-01T00:00:00Z') },
    { id: 'two', title: '別の合成シート', updatedAt: new Date('2026-10-02T00:00:00Z') },
  ],
  activeSheetId: 'one',
  title: '合成シート',
  status: <span role="status">保存済み</span>,
  disabled: false,
  busy: false,
  saving: false,
  dark: false,
  showPreview: true,
  onSelectSheet: vi.fn(),
  onCreateSheet: vi.fn(),
  onDeleteSheet: vi.fn(),
  onExport: vi.fn(),
  onHistory: vi.fn(),
  onToggleTheme: vi.fn(),
  onTogglePreview: vi.fn(),
  onOpenPreview: vi.fn(),
  onSave: vi.fn(),
  onView: vi.fn(() => true),
});

describe('WorkspaceTopbar', () => {
  it('シート一覧から選択でき、閉じた後も保存ボタンを操作できる', async () => {
    const data = props();
    const user = userEvent.setup();
    render(<WorkspaceTopbar {...data} />);
    await user.click(screen.getByRole('button', { name: 'シートを切り替える: 合成シート' }));
    await user.click(screen.getByRole('button', { name: '「別の合成シート」に切り替える' }));
    expect(data.onSelectSheet).toHaveBeenCalledWith('two');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(data.onSave).toHaveBeenCalledOnce();
  });

  it('端末の入力履歴とバックアップはその他から呼び出す', async () => {
    const data = props();
    const user = userEvent.setup();
    render(<WorkspaceTopbar {...data} />);
    await user.click(screen.getByRole('button', { name: 'その他の操作' }));
    await user.click(screen.getByRole('button', { name: /この端末の入力履歴/ }));
    expect(data.onHistory).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'その他の操作' }));
    await user.click(screen.getByRole('button', { name: /バックアップを書き出す/ }));
    expect(data.onExport).toHaveBeenCalledOnce();
  });

  it('読み込み失敗中と保存中は保存の二重送信を防ぐ', () => {
    const data = props();
    const { rerender } = render(<WorkspaceTopbar {...data} disabled />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(data.onSave).not.toHaveBeenCalled();
    rerender(<WorkspaceTopbar {...data} saving />);
    expect(screen.getByRole('button', { name: '保存中' })).toBeDisabled();
  });

  it('未保存確認で拒否した閲覧遷移を阻止する', () => {
    const data = props();
    data.onView.mockReturnValue(false);
    render(<WorkspaceTopbar {...data} />);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('link', { name: '閲覧へ' }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(data.onView).toHaveBeenCalledOnce();
  });
});
