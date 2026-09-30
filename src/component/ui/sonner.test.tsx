import { act, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeModeProvider } from '@/context/theme-context';

import { Toaster } from './sonner';

const renderToaster = () =>
  render(
    <ThemeModeProvider>
      <Toaster />
    </ThemeModeProvider>,
  );

describe('Toaster（#420: sonner 注入 CSS に負けずアプリのトークンを使う）', () => {
  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
  });

  it('背景・文字色・枠線・角丸を sonner のテーマ変数経由でアプリのトークンへ連動させる', async () => {
    renderToaster();
    act(() => {
      toast('保存しました');
    });
    const item = await screen.findByText('保存しました');
    const toaster = item.closest('[data-sonner-toaster]') as HTMLElement;
    expect(toaster.style.getPropertyValue('--normal-bg')).toBe('var(--card)');
    expect(toaster.style.getPropertyValue('--normal-text')).toBe('var(--card-foreground)');
    expect(toaster.style.getPropertyValue('--normal-border')).toBe('var(--border)');
    expect(toaster.style.getPropertyValue('--border-radius')).toBe('var(--radius-xl)');
    // 位置は従来どおり下中央
    expect(toaster.getAttribute('data-y-position')).toBe('bottom');
    expect(toaster.getAttribute('data-x-position')).toBe('center');
  });

  it('影は unlayered な sonner 既定値に勝つ important 付きの elevation-4 を当て、フォーカスは ring で示す', async () => {
    renderToaster();
    act(() => {
      toast('影の確認');
    });
    const item = (await screen.findByText('影の確認')).closest('[data-sonner-toast]') as HTMLElement;
    expect(item.className).toContain('!shadow-elevation-4');
    expect(item.className).toContain('focus-visible:ring-2');
  });
});
