import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActiveHeading } from './use-active-heading';

describe('useActiveHeading', () => {
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockUnobserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;
  let observerCallback: IntersectionObserverCallback;

  beforeEach(() => {
    mockObserve = vi.fn();
    mockUnobserve = vi.fn();
    mockDisconnect = vi.fn();

    // IntersectionObserverのモック
    global.IntersectionObserver = vi.fn().mockImplementation((callback) => {
      observerCallback = callback;
      return {
        observe: mockObserve,
        unobserve: mockUnobserve,
        disconnect: mockDisconnect,
        root: null,
        rootMargin: '-100px 0px -66% 0px',
        thresholds: [0],
        takeRecords: () => [],
      };
    });

    // DOMのモック
    document.getElementById = vi.fn((id: string) => {
      const element = document.createElement('div');
      element.id = id;
      return element;
    });
  });

  describe('初期化', () => {
    it('初期状態ではactiveIdが空文字列であること', () => {
      const { result } = renderHook(() => useActiveHeading([]));
      expect(result.current).toBe('');
    });

    it('見出しIDが空の配列の場合、observerが作成されないこと', () => {
      renderHook(() => useActiveHeading([]));
      expect(global.IntersectionObserver).not.toHaveBeenCalled();
    });

    it('見出しIDがある場合、IntersectionObserverが作成されること', () => {
      const headingIds = ['heading-1', 'heading-2'];
      renderHook(() => useActiveHeading(headingIds));

      expect(global.IntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          rootMargin: '-100px 0px -66% 0px',
          threshold: 0,
        }),
      );
    });

    it('正しいオプションでIntersectionObserverが作成されること', () => {
      renderHook(() => useActiveHeading(['heading-1']));

      expect(global.IntersectionObserver).toHaveBeenCalledWith(expect.any(Function), {
        rootMargin: '-100px 0px -66% 0px',
        threshold: 0,
      });
    });
  });

  describe('要素の監視', () => {
    it('各見出し要素がobserveされること', () => {
      const headingIds = ['heading-1', 'heading-2', 'heading-3'];
      renderHook(() => useActiveHeading(headingIds));

      expect(mockObserve).toHaveBeenCalledTimes(headingIds.length);
    });

    it('存在しない要素はobserveされないこと', () => {
      // 一部の要素だけ存在しないようにモック
      document.getElementById = vi.fn((id: string) => {
        if (id === 'heading-2') return null;
        const element = document.createElement('div');
        element.id = id;
        return element;
      });

      const headingIds = ['heading-1', 'heading-2', 'heading-3'];
      renderHook(() => useActiveHeading(headingIds));

      // heading-2は存在しないので2回だけobserveされる
      expect(mockObserve).toHaveBeenCalledTimes(2);
    });
  });

  describe('アクティブな見出しの更新', () => {
    it('要素が交差した時にactiveIdが更新されること', async () => {
      const headingIds = ['heading-1', 'heading-2'];
      const { result } = renderHook(() => useActiveHeading(headingIds));

      // 要素が交差したことをシミュレート
      const mockEntry: IntersectionObserverEntry = {
        isIntersecting: true,
        target: { id: 'heading-1' } as HTMLElement,
        intersectionRatio: 1,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: Date.now(),
      };

      observerCallback([mockEntry], {} as IntersectionObserver);

      await waitFor(() => {
        expect(result.current).toBe('heading-1');
      });
    });

    it('複数の要素が交差した時、最後の要素のIDが使われること', async () => {
      const headingIds = ['heading-1', 'heading-2', 'heading-3'];
      const { result } = renderHook(() => useActiveHeading(headingIds));

      const mockEntries: IntersectionObserverEntry[] = [
        {
          isIntersecting: true,
          target: { id: 'heading-1' } as HTMLElement,
        } as unknown as IntersectionObserverEntry,
        {
          isIntersecting: true,
          target: { id: 'heading-2' } as HTMLElement,
        } as unknown as IntersectionObserverEntry,
      ];

      observerCallback(mockEntries, {} as IntersectionObserver);

      await waitFor(() => {
        expect(result.current).toBe('heading-2');
      });
    });

    it('交差していない要素ではactiveIdが更新されないこと', async () => {
      const headingIds = ['heading-1'];
      const { result } = renderHook(() => useActiveHeading(headingIds));

      const mockEntry: IntersectionObserverEntry = {
        isIntersecting: false,
        target: { id: 'heading-1' } as HTMLElement,
      } as unknown as IntersectionObserverEntry;

      observerCallback([mockEntry], {} as IntersectionObserver);

      // activeIdは空のまま
      expect(result.current).toBe('');
    });
  });

  describe('クリーンアップ', () => {
    it('アンマウント時に各要素がunobserveされること', () => {
      const headingIds = ['heading-1', 'heading-2', 'heading-3'];
      const { unmount } = renderHook(() => useActiveHeading(headingIds));

      unmount();

      expect(mockUnobserve).toHaveBeenCalledTimes(headingIds.length);
    });

    it('見出しIDが変更された時に古い要素がunobserveされること', () => {
      const { rerender } = renderHook(({ ids }) => useActiveHeading(ids), {
        initialProps: { ids: ['heading-1', 'heading-2'] },
      });

      // 見出しIDを変更
      rerender({ ids: ['heading-3', 'heading-4'] });

      expect(mockUnobserve).toHaveBeenCalledTimes(2);
    });

    it('見出しIDが空になった時にクリーンアップされること', () => {
      const { rerender } = renderHook(({ ids }) => useActiveHeading(ids), {
        initialProps: { ids: ['heading-1', 'heading-2'] },
      });

      // 空の配列に変更
      rerender({ ids: [] });

      expect(mockUnobserve).toHaveBeenCalledTimes(2);
    });
  });

  describe('見出しIDの変更', () => {
    it('見出しIDが追加された時に新しい要素がobserveされること', () => {
      const { rerender } = renderHook(({ ids }) => useActiveHeading(ids), {
        initialProps: { ids: ['heading-1'] },
      });

      mockObserve.mockClear();

      // 見出しIDを追加
      rerender({ ids: ['heading-1', 'heading-2'] });

      expect(mockObserve).toHaveBeenCalledTimes(2);
    });

    it('見出しIDが変更されると古いObserverが破棄されること', () => {
      const { rerender } = renderHook(({ ids }) => useActiveHeading(ids), {
        initialProps: { ids: ['heading-1'] },
      });

      // 見出しIDを変更
      rerender({ ids: ['heading-2'] });

      expect(mockUnobserve).toHaveBeenCalledTimes(1);
      expect(mockObserve).toHaveBeenCalledTimes(2); // 初期化時1回 + 再レンダリング時1回
    });
  });

  describe('エッジケース', () => {
    it('同じ見出しIDが複数回交差してもactiveIdは同じであること', async () => {
      const headingIds = ['heading-1'];
      const { result } = renderHook(() => useActiveHeading(headingIds));

      const mockEntry: IntersectionObserverEntry = {
        isIntersecting: true,
        target: { id: 'heading-1' } as HTMLElement,
      } as unknown as IntersectionObserverEntry;

      // 同じエントリを2回送信
      observerCallback([mockEntry], {} as IntersectionObserver);
      observerCallback([mockEntry], {} as IntersectionObserver);

      await waitFor(() => {
        expect(result.current).toBe('heading-1');
      });
    });

    it('大量の見出しIDでも正常に動作すること', () => {
      const headingIds = Array.from({ length: 100 }, (_, i) => `heading-${i}`);
      const { result } = renderHook(() => useActiveHeading(headingIds));

      expect(mockObserve).toHaveBeenCalledTimes(100);
      expect(result.current).toBe('');
    });
  });
});
