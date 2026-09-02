import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ObservabilityHandle, registerObservabilityHandle } from '@/lib/observability/capture';

import { useReadDepth } from './use-read-depth';

function setScroll(scrollY: number, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(document.documentElement, 'clientHeight', { value: clientHeight, configurable: true });
}

describe('useReadDepth', () => {
  let handle: ObservabilityHandle;

  beforeEach(() => {
    handle = { capture: vi.fn(), track: vi.fn() };
    registerObservabilityHandle(handle);
    // rAF を setTimeout(0) に差し替える。同期実行にすると、フック内の
    // `rafRef.current = requestAnimationFrame(checkDepth)` の代入が checkDepth 内の
    // `rafRef.current = null` より後に走ってしまい（cb がコールバック内で先に呼ばれるため）、
    // 2回目以降の scroll がずっと無視される事故になる（テストでのみ起きる順序問題）。
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
    );
    setScroll(0, 2000, 1000);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('マウント直後に現在位置の到達度を判定する（スクロール不要な短いページで100%を送る）', () => {
    setScroll(0, 500, 1000); // scrollHeight <= clientHeight → 常に100%
    renderHook(() => useReadDepth());
    expect(handle.track).toHaveBeenCalledWith(expect.objectContaining({ name: 'sheet_read_depth', depthPercent: 100 }));
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('25/50/75/100% をそれぞれ1回ずつ送る（重複しない）', async () => {
    renderHook(() => useReadDepth());

    setScroll(250, 2000, 1000); // (250+1000)/2000 = 62.5% → 25・50 が発火
    window.dispatchEvent(new Event('scroll'));
    await tick();
    setScroll(250, 2000, 1000);
    window.dispatchEvent(new Event('scroll')); // 同じ位置での再発火は増えない
    await tick();

    setScroll(1000, 2000, 1000); // 100%
    window.dispatchEvent(new Event('scroll'));
    await tick();

    const depths = (handle.track as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].depthPercent);
    expect(depths).toEqual([25, 50, 75, 100]);
  });

  it('enabled=false なら一切送らない', () => {
    renderHook(() => useReadDepth(false));
    window.dispatchEvent(new Event('scroll'));
    expect(handle.track).not.toHaveBeenCalled();
  });

  it('アンマウント後は scroll listener が残らない', async () => {
    const { unmount } = renderHook(() => useReadDepth());
    unmount();
    (handle.track as ReturnType<typeof vi.fn>).mockClear();
    setScroll(1000, 2000, 1000);
    window.dispatchEvent(new Event('scroll'));
    await tick();
    expect(handle.track).not.toHaveBeenCalled();
  });

  function stubResizeObserver(): { fire: () => void } {
    let callback: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    return { fire: () => callback?.() };
  }

  it('load 完了前の ResizeObserver 通知は無視する（未読込画像による早期到達を防ぐ）', () => {
    const { fire } = stubResizeObserver();
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    setScroll(1000, 2000, 1000); // 100% 相当（scrollable かつ最下部）
    renderHook(() => useReadDepth());

    fire(); // load 前の通知は無視されるべき
    expect(handle.track).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    expect(handle.track).toHaveBeenCalledWith(expect.objectContaining({ depthPercent: 100 }));

    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  });

  it('document の収縮だけを伴う resize 通知は既読度を進めない（セクション OFF 対策）', () => {
    const { fire } = stubResizeObserver();
    setScroll(0, 2000, 1000); // マウント時に 25・50% が発火
    renderHook(() => useReadDepth());
    (handle.track as ReturnType<typeof vi.fn>).mockClear();

    setScroll(0, 1000, 1000); // scrollHeight が縮む → 見かけ上は 100% だが実際は読んでいない
    fire();
    expect(handle.track).not.toHaveBeenCalled();
  });
});
