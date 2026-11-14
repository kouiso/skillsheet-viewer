import { fireEvent, render, screen, within } from '@testing-library/react';
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

  // デザインボード n05-light の「シート切替」メニュー。
  describe('シート切替メニュー（デザインボード U11）', () => {
    const open = async () => {
      const data = props();
      data.sheets = [
        { id: 'one', title: '合成シート', updatedAt: new Date('2026-09-24T03:41:00Z') },
        { id: 'two', title: '別の合成シート', updatedAt: new Date('2026-08-30T02:12:00Z') },
        { id: 'three', title: '三つ目の合成シート', updatedAt: new Date('2026-09-18T11:05:00Z') },
      ];
      const user = userEvent.setup();
      render(<WorkspaceTopbar {...data} />);
      await user.click(screen.getByRole('button', { name: 'シートを切り替える: 合成シート' }));
      return { data, user, menu: screen.getByRole('dialog', { name: 'シートを切り替える' }) };
    };

    it('最終保存は「9/24 12:41」の月日と時刻だけで、年・秒・曜日は出さない', async () => {
      const { menu } = await open();
      expect(within(menu).getByText('最終保存 9/24 12:41')).toBeInTheDocument();
      expect(within(menu).getByText('最終保存 8/30 11:12')).toBeInTheDocument();
      expect(within(menu).getByText('最終保存 9/18 20:05')).toBeInTheDocument();
      expect(menu.textContent).not.toMatch(/2026|:\d\d:\d\d/);
    });

    it('見出し「シート」、選択中だけチェック印、他はファイル印で並ぶ', async () => {
      const { menu } = await open();
      expect(within(menu).getByRole('heading', { name: 'シート' })).toBeInTheDocument();
      const rows = within(menu).getAllByRole('listitem');
      expect(rows).toHaveLength(3);
      expect(rows[0].querySelector('svg.lucide-check')).not.toBeNull();
      expect(rows[1].querySelector('svg.lucide-check')).toBeNull();
      expect(rows[1].querySelector('svg.lucide-file-text')).not.toBeNull();
      expect(within(rows[0]).getByRole('button', { name: '「合成シート」に切り替える' })).toHaveAttribute(
        'aria-current',
        'true',
      );
    });

    it('削除は行の右端にあり、マウス操作の端末では行に触れるまで見えない', async () => {
      const { menu } = await open();
      const remove = within(menu).getByRole('button', { name: '「別の合成シート」を削除' });
      expect(remove.closest('li')).not.toBeNull();
      expect(remove.className).toContain('group-hover:opacity-100');
      expect(remove.className).toContain('group-focus-within:opacity-100');
      expect(remove.className).toContain('pointer-coarse:opacity-100');
    });

    it('一覧の下に区切り線を挟んで「新しいシートを作る…」が最後に来る', async () => {
      const { menu, data, user } = await open();
      const create = within(menu).getByRole('button', { name: '新しいシートを作る…' });
      expect(create.previousElementSibling?.tagName).toBe('HR');
      expect(create.nextElementSibling).toBeNull();
      await user.click(create);
      expect(data.onCreateSheet).toHaveBeenCalledOnce();
    });
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
