import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SyncBar } from './sync-bar';

describe('SyncBar', () => {
  it('live: 最終更新時刻つきで同期中と表示する', () => {
    render(<SyncBar state="live" lastUpdatedAt={Date.now()} onReconnect={vi.fn()} />);
    expect(screen.getByText('編集中の内容を同期表示')).toBeInTheDocument();
  });

  it('stale: 再接続ボタンを表示する', () => {
    render(<SyncBar state="stale" lastUpdatedAt={Date.now()} onReconnect={vi.fn()} />);
    expect(screen.getByText('同期が途切れています')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再接続/ })).toBeInTheDocument();
  });

  it('closed: 編集画面が閉じられた旨を表示する（接続後に閉じたケース）', () => {
    render(<SyncBar state="closed" lastUpdatedAt={Date.now()} onReconnect={vi.fn()} />);
    expect(screen.getByText('編集画面が閉じられました — 表示は最後の内容です')).toBeInTheDocument();
  });

  // #151 U-5: 一度も編集画面と接続していない（このURLへ直接アクセスした）のに
  // 「編集画面が閉じられました — 表示は最後の内容です」と出ると、データを失ったと
  // 誤解させる。standalone はこのケース専用の文言を持つ。
  it('standalone: 一度も接続していないときは「閉じられた」ではなく実態に合った文言を出す', () => {
    render(<SyncBar state="standalone" lastUpdatedAt={null} onReconnect={vi.fn()} />);
    expect(screen.getByText(/表示できるプレビューがありません/)).toBeInTheDocument();
    expect(screen.queryByText(/閉じられました/)).not.toBeInTheDocument();
    // #201: standalone にはフォーカス可能な導線が無く、ビルダーへ戻れなかった。
    // 文言だけでなく /builder へのリンク自体を検証する（CodeRabbit レビュー指摘:
    // 文言のみのアサートだとリンクの削除や href の変更を検知できない）。
    expect(screen.getByRole('link', { name: 'ビルダー画面を開く' })).toHaveAttribute('href', '/builder');
  });
});
