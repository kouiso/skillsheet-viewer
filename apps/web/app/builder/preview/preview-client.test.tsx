import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PreviewClient from './preview-client';

describe('PreviewClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // 他テストで書き換えた window.opener を jsdom の既定（null）へ戻す。
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
  });

  it('window.opener が無く一度も内容を受け取っていない場合（URL直接アクセス）は standalone を表示する（#151 U-5）', () => {
    // jsdom の既定では window.opener は null。
    render(<PreviewClient />);
    vi.advanceTimersByTime(0);

    expect(screen.getByText(/表示できるプレビューがありません/)).toBeInTheDocument();
    expect(screen.queryByText(/編集画面が閉じられました/)).not.toBeInTheDocument();
  });

  it('localStorage に前回セッションの残留 seed があっても、window.opener が無ければ standalone を表示する（レビュー指摘: URL直接アクセスなのに「閉じられた」と誤表示していた）', () => {
    localStorage.setItem('builder-preview-payload', JSON.stringify({ title: 'テスト', content: '本文' }));
    render(<PreviewClient />);
    vi.advanceTimersByTime(0);

    expect(screen.getByText(/表示できるプレビューがありません/)).toBeInTheDocument();
    expect(screen.queryByText(/編集画面が閉じられました/)).not.toBeInTheDocument();
  });

  it('localStorage に前回セッションの残留 seed があっても、window.opener が無ければ残留内容自体を読み込まない（レビュー指摘: ラベルは standalone なのに古いタイトル/本文が薄く表示され続けていた）', () => {
    localStorage.setItem('builder-preview-payload', JSON.stringify({ title: '残留タイトル', content: '残留本文' }));
    render(<PreviewClient />);
    vi.advanceTimersByTime(0);

    expect(screen.queryByText('残留タイトル')).not.toBeInTheDocument();
    expect(screen.queryByText('残留本文')).not.toBeInTheDocument();
    expect(screen.getByText('プレビュー')).toBeInTheDocument();
  });

  it('window.opener があり（別窓として開かれた）、その後閉じられた場合は closed（最後の内容）を表示する', () => {
    Object.defineProperty(window, 'opener', { value: { closed: true }, configurable: true });
    localStorage.setItem('builder-preview-payload', JSON.stringify({ title: 'テスト', content: '本文' }));
    render(<PreviewClient />);
    vi.advanceTimersByTime(0);

    expect(screen.getByText(/編集画面が閉じられました/)).toBeInTheDocument();
  });

  it('window.opener があり、マウント後に編集画面が閉じられた場合は live から closed へ遷移する', () => {
    const opener = { closed: false };
    Object.defineProperty(window, 'opener', { value: opener, configurable: true });
    localStorage.setItem('builder-preview-payload', JSON.stringify({ title: 'テスト', content: '本文' }));
    render(<PreviewClient />);
    vi.advanceTimersByTime(0);

    expect(screen.queryByText(/編集画面が閉じられました/)).not.toBeInTheDocument();

    opener.closed = true;
    // setInterval のコールバック内での setState は act() の外で発火するため、
    // React の再レンダーがDOMへ反映されるまでを明示的に待つ。
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText(/編集画面が閉じられました/)).toBeInTheDocument();
  });
});
