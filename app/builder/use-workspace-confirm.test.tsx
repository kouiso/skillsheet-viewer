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

describe('デザインボードの並び・フォーカス・縦積み', () => {
  function Open({ extra }: { extra: object }) {
    const { confirm, dialog } = useWorkspaceConfirm();
    return (
      <>
        <button type="button" onClick={() => void confirm({ ...options, cancelLabel: '戻る', ...extra })}>
          開く
        </button>
        {dialog}
      </>
    );
  }
  const footerLabels = () =>
    Array.from(document.querySelectorAll('[data-confirm-footer] button')).map((node) => node.textContent);

  it('既定は取消が左・確認が右で、取消にフォーカスする（削除系・ボードに無い確認）', async () => {
    render(<Open extra={{}} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '戻る' })).toHaveFocus());
    expect(footerLabels()).toEqual(['戻る', '削除する']);
    expect(document.querySelector('[data-confirm-icon="danger"]')).not.toBeNull();
  });

  it('danger-first は危険が左・主の取消側が右で、安全側（取消）にフォーカスする', async () => {
    render(<Open extra={{ order: 'danger-first', cancelVariant: 'primary', icon: 'warn' }} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '戻る' })).toHaveFocus());
    expect(footerLabels()).toEqual(['削除する', '戻る']);
    expect(screen.getByRole('button', { name: '戻る' }).className).toContain('bg-primary-dark');
    expect(screen.getByRole('button', { name: '削除する' }).className).toContain('text-destructive');
    expect(document.querySelector('[data-confirm-icon="warn"]')).not.toBeNull();
  });

  it('危険でない確認は info アイコンで、確認が主ボタンになる', async () => {
    render(<Open extra={{ danger: false }} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '戻る' })).toHaveFocus());
    expect(document.querySelector('[data-confirm-icon="info"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: '削除する' }).className).toContain('bg-primary-dark');
  });

  it('390px 相当の縦積み（column-reverse・全幅・高さ44px）と広い幅の寸法クラスを持つ', async () => {
    render(<Open extra={{}} />);
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    const footer = await waitFor(() => {
      const node = document.querySelector('[data-confirm-footer]');
      if (!node) throw new Error('footer');
      return node;
    });
    expect(footer.className).toContain('flex-col-reverse');
    expect(footer.className).toContain('sm:flex-row');
    for (const button of Array.from(footer.querySelectorAll('button'))) {
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('h-11');
      expect(button.className).toContain('sm:h-9');
      expect(button.className).toContain('sm:w-auto');
    }
    const content = screen.getByRole('alertdialog');
    expect(content.className).toContain('max-w-[480px]');
    expect(content.className).toContain('p-5');
    expect(content.className).toContain('sm:p-6');
  });
});
