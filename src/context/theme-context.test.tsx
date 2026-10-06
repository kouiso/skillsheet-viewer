import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeModeProvider, useThemeMode } from './theme-context';

describe('ThemeContext', () => {
  beforeEach(() => {
    // localStorageをクリア
    localStorage.clear();
    // 前テストで html に残った dark クラスを戻す
    document.documentElement.classList.remove('dark');
    // matchMediaのモックをリセット
    // （vi.restoreAllMocks() は setup.ts 側の matchMedia モック実装まで消すため使わない）
    vi.clearAllMocks();
  });

  describe('ThemeModeProvider', () => {
    it('子要素が正しくレンダリングされること', () => {
      render(
        <ThemeModeProvider>
          <div>Test Content</div>
        </ThemeModeProvider>,
      );

      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('localStorageに保存されたテーマを初期値として使用すること', () => {
      localStorage.setItem('theme-mode', 'dark');

      const { result } = renderHook(() => useThemeMode(), {
        wrapper: ThemeModeProvider,
      });

      expect(result.current.mode).toBe('dark');
    });

    it('localStorageが空の場合、システム設定(light)を使用すること', () => {
      // matchMediaでライトモードを返すようにモック
      global.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false, // prefers-color-scheme: darkがfalse = light
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useThemeMode(), {
        wrapper: ThemeModeProvider,
      });

      expect(result.current.mode).toBe('light');
    });

    it('localStorageが空の場合、システム設定(dark)を使用すること', () => {
      // matchMediaでダークモードを返すようにモック
      global.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: true, // prefers-color-scheme: darkがtrue
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useThemeMode(), {
        wrapper: ThemeModeProvider,
      });

      expect(result.current.mode).toBe('dark');
    });

    it('toggleTheme()でライトからダークに切り替わること', async () => {
      // matchMediaでライトモードを返すようにモック
      global.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false, // prefers-color-scheme: darkがfalse = light
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useThemeMode(), {
        wrapper: ThemeModeProvider,
      });

      expect(result.current.mode).toBe('light');

      act(() => {
        result.current.toggleTheme();
      });

      await waitFor(() => {
        expect(result.current.mode).toBe('dark');
      });
    });

    it('toggleTheme()でダークからライトに切り替わること', async () => {
      localStorage.setItem('theme-mode', 'dark');

      const { result } = renderHook(() => useThemeMode(), {
        wrapper: ThemeModeProvider,
      });

      expect(result.current.mode).toBe('dark');

      act(() => {
        result.current.toggleTheme();
      });

      await waitFor(() => {
        expect(result.current.mode).toBe('light');
      });
    });

    it('保存済みテーマの復元完了前に SSR 初期値で localStorage を上書きしないこと（#374）', () => {
      localStorage.setItem('theme-mode', 'dark');
      // act() は全 effect をフラッシュするため、マウントコミットで一瞬だけ行われる
      // 誤った 'light' 書き込みは最終値からは見えない。setItem の呼び出し履歴で検証する。
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      const { result } = renderHook(() => useThemeMode(), {
        wrapper: ThemeModeProvider,
      });

      const themeWrites = setItemSpy.mock.calls.filter(([key]) => key === 'theme-mode').map(([, value]) => value);
      // 期待失敗で中断される前にスパイを戻し、以降のテストへ漏れないようにする
      setItemSpy.mockRestore();
      // バグがあると最初に 'light'（SSR 初期値）を書き込んでから 'dark' に訂正する
      expect(themeWrites, '復元前に light を書き込まないこと').not.toContain('light');
      // 復元完了後は保存値が反映されていること
      expect(result.current.mode).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('theme-mode')).toBe('dark');
    });

    it.each(['unexpected-value', 'DARK', 'null', ''])('不正な保存値 %s は OS のテーマへ戻すこと', (saved) => {
      localStorage.setItem('theme-mode', saved);
      vi.mocked(global.matchMedia).mockReturnValue({ matches: true } as ReturnType<typeof global.matchMedia>);
      const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
      expect(result.current.mode).toBe('dark');
      expect(document.documentElement).toHaveClass('dark');
      act(() => result.current.toggleTheme());
      expect(result.current.mode).toBe('light');
      expect(document.documentElement).not.toHaveClass('dark');
    });

    it('保存値の読取を拒否されても OS 設定で表示し、切り替えできること', () => {
      vi.mocked(global.matchMedia).mockReturnValue({ matches: true } as ReturnType<typeof global.matchMedia>);
      const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('保存領域を利用できません', 'SecurityError');
      });
      try {
        const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
        expect(result.current.mode).toBe('dark');
        expect(document.documentElement).toHaveClass('dark');
        act(() => result.current.toggleTheme());
        expect(result.current.mode).toBe('light');
        expect(document.documentElement).not.toHaveClass('dark');
      } finally {
        read.mockRestore();
      }
    });

    it.each([false, true])('保存拒否でも表示と連続切り替えを保つこと（途中から拒否: %s）', (afterMount) => {
      localStorage.setItem('theme-mode', 'dark');
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const denyWrite = () =>
        write.mockImplementation(() => {
          throw new DOMException('保存容量が不足しています', 'QuotaExceededError');
        });
      try {
        if (!afterMount) denyWrite();
        const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
        expect(result.current.mode).toBe('dark');
        expect(document.documentElement).toHaveClass('dark');
        if (afterMount) denyWrite();
        act(() => result.current.toggleTheme());
        expect(result.current.mode).toBe('light');
        expect(document.documentElement).not.toHaveClass('dark');
        act(() => result.current.toggleTheme());
        expect(result.current.mode).toBe('dark');
        expect(document.documentElement).toHaveClass('dark');
      } finally {
        write.mockRestore();
      }
    });

    it.each([false, true])('保存領域自体の getter 拒否でも OS 設定を使うこと（dark: %s）', (systemDark) => {
      vi.mocked(global.matchMedia).mockReturnValue({ matches: systemDark } as ReturnType<typeof global.matchMedia>);
      const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('保存領域を利用できません', 'SecurityError');
        },
      });
      try {
        const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
        expect(result.current.mode).toBe(systemDark ? 'dark' : 'light');
        expect(document.documentElement.classList.contains('dark')).toBe(systemDark);
        act(() => result.current.toggleTheme());
        expect(document.documentElement.classList.contains('dark')).toBe(!systemDark);
      } finally {
        if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
      }
    });

    it('不正値かつ OS light では light を選ぶこと', () => {
      localStorage.setItem('theme-mode', 'invalid');
      vi.mocked(global.matchMedia).mockReturnValue({ matches: false } as ReturnType<typeof global.matchMedia>);
      const { result } = renderHook(() => useThemeMode(), { wrapper: ThemeModeProvider });
      expect(result.current.mode).toBe('light');
      expect(document.documentElement).not.toHaveClass('dark');
    });

    it('SSR は保存領域へアクセスせず一定の初期表示を返すこと', () => {
      const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('SSR で保存領域へ触れてはいけません', 'SecurityError');
      });
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const Probe = () => <span>{useThemeMode().mode}</span>;
      try {
        expect(
          renderToString(
            <ThemeModeProvider>
              <Probe />
            </ThemeModeProvider>,
          ),
        ).toBe('<span>light</span>');
        expect(read).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
      } finally {
        read.mockRestore();
        write.mockRestore();
      }
    });

    it('テーマ変更時にlocalStorageに保存されること', async () => {
      // matchMediaでライトモードを返すようにモック
      global.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useThemeMode(), {
        wrapper: ThemeModeProvider,
      });

      // 初期状態を確認
      expect(result.current.mode).toBe('light');

      act(() => {
        result.current.toggleTheme();
      });

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('dark');
      });

      act(() => {
        result.current.toggleTheme();
      });

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('light');
      });
    });
  });

  describe('useThemeMode', () => {
    it('ThemeProvider外で使用時にエラーを投げること', () => {
      // エラーをコンソールに出力しないようにする
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useThemeMode());
      }).toThrow('useThemeMode must be used within ThemeProvider');

      consoleError.mockRestore();
    });

    it('ThemeProvider内で使用時にコンテキスト値を返すこと', () => {
      const { result } = renderHook(() => useThemeMode(), {
        wrapper: ThemeModeProvider,
      });

      expect(result.current).toHaveProperty('mode');
      expect(result.current).toHaveProperty('toggleTheme');
      expect(typeof result.current.toggleTheme).toBe('function');
    });
  });
});
