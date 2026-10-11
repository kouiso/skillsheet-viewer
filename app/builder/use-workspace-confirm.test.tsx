import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceConfirm } from './use-workspace-confirm';

const options = {
  title: '会社を削除しますか',
  description: '所属案件も削除します。',
  confirmLabel: '削除する',
  danger: true,
};
function Harness({ answer, twice = false }: { answer: (value: boolean) => void; twice?: boolean }) {
  const fallback = useRef<HTMLButtonElement>(null);
  const { confirm, dialog } = useWorkspaceConfirm({ fallbackFocus: () => fallback.current });
  return (
    <>
      <button
        ref={fallback}
        type="button"
        onClick={() => {
          void confirm(options).then(answer);
          if (twice) void confirm({ ...options, title: '後発' }).then(answer);
        }}
      >
        開く
      </button>
      {dialog}
    </>
  );
}
describe('共通確認ダイアログ', () => {
  it('取消を初期フォーカスにし、Escapeはfalseで起点へ戻す', async () => {
    const answer = vi.fn();
    render(<Harness answer={answer} />);
    const trigger = screen.getByRole('button', { name: '開く' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('button', { name: 'やめる' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('button', { name: 'やめる' }), { key: 'Escape' });
    await waitFor(() => expect(answer).toHaveBeenCalledWith(false));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('明示した実行だけtrueを返す', async () => {
    const answer = vi.fn();
    render(<Harness answer={answer} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await waitFor(() => expect(answer).toHaveBeenCalledExactlyOnceWith(true));
  });
  it('後発確認はfalseで拒否し、先行確認を置き換えない', async () => {
    const answer = vi.fn();
    render(<Harness answer={answer} twice />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    await waitFor(() => expect(answer).toHaveBeenCalledExactlyOnceWith(false));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('会社を削除しますか');
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    await waitFor(() => expect(answer).toHaveBeenCalledTimes(2));
  });
  it('アンマウントで未解決の確認をfalseにする', async () => {
    const answer = vi.fn();
    const view = render(<Harness answer={answer} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    await act(async () => view.unmount());
    expect(answer).toHaveBeenCalledExactlyOnceWith(false);
  });
});

it('起点が消えた場合は指定した代替操作へフォーカスを戻す', async () => {
  function RemovedTrigger() {
    const [show, setShow] = useState(true);
    const fallback = useRef<HTMLButtonElement>(null);
    const { confirm, dialog } = useWorkspaceConfirm({ fallbackFocus: () => fallback.current });
    return (
      <>
        <button type="button" ref={fallback}>
          代替操作
        </button>
        {show && (
          <button
            type="button"
            onClick={() => {
              void confirm(options);
              setShow(false);
            }}
          >
            消える起点
          </button>
        )}
        {dialog}
      </>
    );
  }
  render(<RemovedTrigger />);
  const trigger = screen.getByRole('button', { name: '消える起点' });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '代替操作' })).toHaveFocus());
});
