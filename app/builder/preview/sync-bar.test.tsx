import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  // #626 U12: 板（builder/pw1〜pw4）の寸法。var() は jsdom が解決しないので、
  // 数値で書いている寸法だけを実際の CSS から読んで確かめる（色は実画面の証跡で確かめる）。
  describe('板どおりの寸法（#626）', () => {
    const css = readFileSync(join(__dirname, 'sync-bar.css'), 'utf8');
    const computed = (state: 'live' | 'stale' | 'closed' | 'standalone') => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
      const { container } = render(<SyncBar state={state} lastUpdatedAt={Date.now()} onReconnect={vi.fn()} />);
      const bar = container.querySelector('.syncbar') as HTMLElement;
      return { bar, style, styles: getComputedStyle(bar) };
    };

    it('帯は 13px・最小高 48px・左右 16px', () => {
      const { styles, style } = computed('live');
      expect(styles.fontSize).toBe('13px');
      expect(styles.fontWeight).toBe('600');
      expect(styles.minHeight).toBe('48px');
      expect(styles.paddingLeft).toBe('16px');
      expect(styles.paddingRight).toBe('16px');
      style.remove();
    });

    it('状態ごとの class が付く（色は class で切り替わる）', () => {
      for (const state of ['live', 'stale', 'closed', 'standalone'] as const) {
        const { bar, style } = computed(state);
        expect(bar).toHaveClass('syncbar', state);
        style.remove();
        document.body.innerHTML = '';
      }
    });

    it('closed と standalone は同じ灰色の規則を共有する', () => {
      expect(css).toMatch(/\.syncbar\.closed,\s*\.syncbar\.standalone\s*\{[^}]*background: var\(--muted\)/);
    });

    it('再接続ボタンは 44px 以上の押しやすさを保ち、字は 12.5px で線のアイコンを持つ', () => {
      const { styles, style } = computed('stale');
      const button = screen.getByRole('button', { name: '再接続' });
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(button.textContent).not.toContain('↻');
      expect(css).toMatch(/\.syncbar \.reconnect \{[^}]*min-height: 44px[^}]*font-size: 12\.5px/s);
      expect(styles.fontSize).toBe('13px');
      style.remove();
    });
  });
});
