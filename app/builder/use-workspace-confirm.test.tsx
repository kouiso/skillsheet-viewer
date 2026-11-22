import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceConfirm, type WorkspaceConfirmOptions } from './use-workspace-confirm';

const options = {
  title: '会社を削除しますか',
  description: '所属案件も削除します。',
  confirmLabel: '削除する',
  danger: true,
};
function Harness({
  answer,
  twice = false,
  overrides = {},
}: {
  answer: (value: boolean) => void;
  twice?: boolean;
  overrides?: Partial<WorkspaceConfirmOptions>;
}) {
  const fallback = useRef<HTMLButtonElement>(null);
  const { confirm, dialog } = useWorkspaceConfirm({ fallbackFocus: () => fallback.current });
  return (
    <>
      <button
        ref={fallback}
        type="button"
        onClick={() => {
          void confirm({ ...options, ...overrides }).then(answer);
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

  it('confirmFirst と主ボタン=取消で、板の「捨てるが左・戻るが主」の並びになる', () => {
    const answer = vi.fn();
    render(
      <Harness
        answer={answer}
        overrides={{ confirmFirst: true, primary: 'cancel', cancelLabel: '編集に戻る' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    const buttons = screen.getAllByRole('button');
    const discard = screen.getByRole('button', { name: '削除する' });
    const back = screen.getByRole('button', { name: '編集に戻る' });
    // 危険な「削除する」が左（先）、主ボタンの「編集に戻る」が右（後）
    expect(buttons.indexOf(discard)).toBeLessThan(buttons.indexOf(back));
    expect(back).toHaveClass('bg-primary-dark');
    expect(discard).toHaveClass('text-destructive');
  });

  it('危険な確認は取消が通常・確認が危険の色で、取消が先に並ぶ', () => {
    const answer = vi.fn();
    render(<Harness answer={answer} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    const cancel = screen.getByRole('button', { name: 'やめる' });
    const discard = screen.getByRole('button', { name: '削除する' });
    expect(screen.getAllByRole('button').indexOf(cancel)).toBeLessThan(
      screen.getAllByRole('button').indexOf(discard),
    );
    expect(cancel).not.toHaveClass('bg-primary-dark');
    expect(discard).toHaveClass('text-destructive');
  });

  it('initialFocus=confirm なら最初に確認ボタンにフォーカスする', async () => {
    const answer = vi.fn();
    render(<Harness answer={answer} overrides={{ initialFocus: 'confirm' }} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '削除する' })).toHaveFocus());
  });

  it('板の寸法・見出し・本文・アイコンが出る', () => {
    const answer = vi.fn();
    render(<Harness answer={answer} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    const dialog = screen.getByRole('alertdialog');
    // 板: 最大幅 480px・内側 24px（狭い画面では 20px）・中の間隔 10px
    expect(dialog).toHaveClass('max-w-[480px]', 'p-6', 'gap-2.5');
    expect(dialog.querySelector('[aria-hidden="true"]')).toHaveClass('bg-danger-soft', 'h-8', 'w-8');
    // 題名 16px・太さ 700 / 本文 13.5px・行高 1.8・左 44px（390px では 0）
    expect(screen.getByText('会社を削除しますか')).toHaveClass('text-base', 'font-bold');
    expect(screen.getByText('所属案件も削除します。')).toHaveClass(
      'text-[13.5px]',
      'pl-11',
      'max-sm:pl-0',
    );
  });

  it('注意の tone は警告色の丸アイコンを出す', () => {
    const answer = vi.fn();
    render(<Harness answer={answer} overrides={{ tone: 'notice', danger: false }} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    const icon = screen.getByRole('alertdialog').querySelector('[aria-hidden="true"]');
    expect(icon).toHaveClass('bg-warn-soft', 'text-warn-strong');
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
