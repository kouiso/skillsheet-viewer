import { render, screen } from '@testing-library/react';
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

  it('window.opener があり（別窓として開かれた）、その後閉じられた場合は closed（最後の内容）を表示する', () => {
    Object.defineProperty(window, 'opener', { value: { closed: true }, configurable: true });
    localStorage.setItem('builder-preview-payload', JSON.stringify({ title: 'テスト', content: '本文' }));
    render(<PreviewClient />);
    vi.advanceTimersByTime(0);

    expect(screen.getByText(/編集画面が閉じられました/)).toBeInTheDocument();
  });
});
