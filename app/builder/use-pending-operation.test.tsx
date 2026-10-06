import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePendingOperation } from './use-pending-operation';
import { useWorkspaceConfirm } from './use-workspace-confirm';

describe('確認を含む非同期操作の直列化', () => {
  it('同じ描画内の二重実行も同期refで拒否する', async () => {
    let finish: () => void = () => {
      throw new Error('未開始');
    };
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => usePendingOperation());
    let first: Promise<void>;
    act(() => {
      first = result.current[1](action);
      void result.current[1](action);
    });
    expect(action).toHaveBeenCalledOnce();
    expect(result.current[0]).toBe(true);
    await act(async () => {
      finish();
      await first;
    });
    expect(result.current[0]).toBe(false);
  });
  it('確認await中もDialogを即描画し、回答まではbusyを保つ', async () => {
    function Harness() {
      const [busy, run] = usePendingOperation();
      const { confirm, dialog } = useWorkspaceConfirm();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void run(async () => {
                await confirm({ title: '確認', description: '合成説明', confirmLabel: '実行' });
              });
            }}
          >
            開始
          </button>
          <output>{busy ? '処理中' : '待機'}</output>
          {dialog}
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '開始' }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    expect(screen.getByText('処理中')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    await waitFor(() => expect(screen.getByText('待機')).toBeVisible());
  });
  it('失敗を呼出元に返し、次の操作を実行できる', async () => {
    const { result } = renderHook(() => usePendingOperation());
    await act(async () => {
      await expect(
        result.current[1](async () => {
          throw new Error('合成失敗');
        }),
      ).rejects.toThrow('合成失敗');
    });
    expect(result.current[0]).toBe(false);
    const retry = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current[1](retry);
    });
    expect(retry).toHaveBeenCalledOnce();
    expect(result.current[0]).toBe(false);
  });
});
