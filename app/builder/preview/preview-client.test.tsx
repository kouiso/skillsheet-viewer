import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PreviewClient from './preview-client';

// 描画部品は実物を使い、通信だけ合成イベントで制御する。
class Channel {
  static channels: Channel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  close = vi.fn();
  constructor() {
    Channel.channels.push(this);
  }
  emit(data: unknown) {
    act(() => this.onmessage?.({ data }));
  }
}
const value = (sequence: number, content = '合成本文') => ({
  title: '合成タイトル',
  content,
  sessionId: 'session-a',
  sequence,
});
const opener = (closed = false) => Object.defineProperty(window, 'opener', { value: { closed }, configurable: true });
const current = () => Channel.channels.at(-1) as Channel;
describe('PreviewClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    Channel.channels = [];
    vi.stubGlobal('BroadcastChannel', Channel);
    window.history.replaceState(null, '', '/builder/preview?session=session-a');
    opener();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    opener(true);
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
    window.history.replaceState(null, '', '/');
  });
  it('直接アクセスは残留seedも別editorの通信も読み込まない', () => {
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
    localStorage.setItem('builder-preview-payload', JSON.stringify(value(1, '残留本文')));
    render(<PreviewClient />);
    expect(screen.getByText(/表示できるプレビューがありません/)).toBeInTheDocument();
    expect(screen.queryByText('残留本文')).not.toBeInTheDocument();
    expect(Channel.channels).toHaveLength(0);
  });
  it('openerがあってもセッション無しの旧URLは残留本文を採用しない', () => {
    window.history.replaceState(null, '', '/builder/preview');
    localStorage.setItem('builder-preview-payload', JSON.stringify(value(1)));
    render(<PreviewClient />);
    expect(screen.getByText(/表示できるプレビューがありません/)).toBeInTheDocument();
    expect(Channel.channels).toHaveLength(0);
  });
  it('未受信も12秒超で途切れ扱いにし、再接続後の新しい通信で復帰する', () => {
    render(<PreviewClient />);
    expect(screen.getByText('編集画面からの内容を待っています')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(14000));
    expect(screen.getByText('同期が途切れています')).toBeInTheDocument();
    const old = current();
    fireEvent.click(screen.getByRole('button', { name: /再接続/ }));
    expect(old.close).toHaveBeenCalledOnce();
    old.emit(value(99, '旧channel本文'));
    expect(screen.queryByText('旧channel本文')).not.toBeInTheDocument();
    current().emit(value(2));
    expect(screen.getByText('編集中の内容を同期表示')).toBeInTheDocument();
    expect(screen.getByText('合成本文')).toBeInTheDocument();
  });
  it('別session・古い順番・重複・不正連番を拒否し、空内容も新しい版として反映する', () => {
    localStorage.setItem('builder-preview-payload', JSON.stringify(value(2)));
    render(<PreviewClient />);
    const channel = current();
    channel.emit({ ...value(3, '別session'), sessionId: 'session-b' });
    channel.emit(value(1, '旧本文'));
    channel.emit(value(2, '重複本文'));
    channel.emit(value(Infinity, '不正本文'));
    expect(screen.getByText('合成本文')).toBeInTheDocument();
    channel.emit(value(3, ''));
    expect(screen.queryByText('合成本文')).not.toBeInTheDocument();
    expect(screen.getByText('合成タイトル')).toBeInTheDocument();
  });
  it('親が閉じても受信済み長文を保持し、後着通信でliveに戻らない', () => {
    const long = `${'合成長文'.repeat(400)}末尾の検証`;
    localStorage.setItem('builder-preview-payload', JSON.stringify(value(1, long)));
    render(<PreviewClient />);
    opener(true);
    act(() => vi.advanceTimersByTime(2000));
    current().emit(value(2, '後着本文'));
    expect(screen.getByText(/編集画面が閉じられました/)).toBeInTheDocument();
    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.queryByText('後着本文')).not.toBeInTheDocument();
    expect(document.querySelector('.stale-body')).toBeNull();
  });
  it('通信機能の生成失敗でも本文領域を落とさない', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('拒否');
        }
      },
    );
    render(<PreviewClient />);
    expect(screen.getByText('同期が途切れています')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再接続/ })).toBeEnabled();
  });
});
