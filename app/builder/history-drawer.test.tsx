import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { HistoryEntry } from './history';
import { HistoryDrawer } from './history-drawer';

const entries: HistoryEntry[] = [
  { id: 'a', at: Date.now(), label: '案件を編集', snapshot: { companies: [], items: [] } },
];

describe('HistoryDrawer', () => {
  it('閉じる途中のpopover起点へ戻さず常設ボタンへ戻す', async () => {
    const user = userEvent.setup();
    function Fixture() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-workspace-focus>
            シート
          </button>
          <div data-radix-popper-content-wrapper>
            <button type="button" onClick={() => setOpen(true)}>
              履歴を開く
            </button>
          </div>
          {open && <HistoryDrawer entries={entries} onRestore={vi.fn()} onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: '履歴を開く' }));
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'シート' })).toHaveFocus());
  });
  it('確認をやめても履歴drawerは残り、確認後だけ元のsnapshotを復元する', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn(),
      onRestore = vi.fn();
    const old: HistoryEntry = {
      id: 'old',
      at: 1,
      label: '古い原稿',
      snapshot: { companies: [{ id: 'c', name: '保持する会社', kind: '', period: '', note: '原文\n\n' }], items: [] },
    };
    render(<HistoryDrawer entries={[...entries, old]} onClose={onClose} onRestore={onRestore} />);
    await user.click(screen.getByRole('button', { name: 'この時点に戻す' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'やめる' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '変更履歴' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'この時点に戻す' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'この時点に戻す' }));
    expect(onRestore).toHaveBeenCalledExactlyOnceWith(old.snapshot);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Radix が背景をモーダルから分離する。旧別ボタンを残さない。
  it('背景を覆う別ボタンを置かない', () => {
    const { container } = render(<HistoryDrawer entries={entries} onClose={vi.fn()} onRestore={vi.fn()} />);

    expect(container.querySelector('.hist-overlay-close')).toBeNull();
  });

  it('背景クリックで閉じる', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HistoryDrawer entries={entries} onClose={onClose} onRestore={vi.fn()} />);
    await user.click(screen.getByTestId('history-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ドロワーの中身をクリックしても閉じない', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HistoryDrawer entries={entries} onClose={onClose} onRestore={vi.fn()} />);

    await user.click(screen.getByText('変更履歴'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
