import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { HistoryDrawer } from './history-drawer';

// jsdom は showModal()/close() を実装していないので、open 属性だけ動かす最小の代替を入れる。
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void;
    close?: () => void;
  };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const entries = [{ id: 'a', at: Date.now(), label: '案件を編集', snapshot: { items: [] } }] as never;

describe('HistoryDrawer', () => {
  // showModal() は dialog 以外を inert にする。背景に重ねたボタンは押せないので残してはいけない。
  it('背景を覆う別ボタンを置かない', () => {
    const { container } = render(<HistoryDrawer entries={entries} onClose={vi.fn()} onRestore={vi.fn()} />);

    expect(container.querySelector('.hist-overlay-close')).toBeNull();
  });

  it('背景（dialog 自身）のクリックで閉じる', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<HistoryDrawer entries={entries} onClose={onClose} onRestore={vi.fn()} />);

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();
    await user.click(dialog as HTMLDialogElement);

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
