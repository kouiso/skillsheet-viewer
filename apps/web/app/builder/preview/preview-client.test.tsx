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
  });

  it('window.opener が無く一度も内容を受け取っていない場合（URL直接アクセス）は standalone を表示する（#151 U-5）', () => {
    // jsdom の既定では window.opener は null。
    render(<PreviewClient />);
    vi.advanceTimersByTime(0);

    expect(screen.getByText(/表示できるプレビューがありません/)).toBeInTheDocument();
    expect(screen.queryByText(/編集画面が閉じられました/)).not.toBeInTheDocument();
  });

  it('localStorage に seed された内容があれば、opener が無くても closed（最後の内容）を表示する', () => {
    localStorage.setItem('builder-preview-payload', JSON.stringify({ title: 'テスト', content: '本文' }));
    render(<PreviewClient />);
    vi.advanceTimersByTime(0);

    expect(screen.getByText(/編集画面が閉じられました/)).toBeInTheDocument();
  });
});
