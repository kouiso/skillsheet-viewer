import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { ThemeModeProvider, useThemeMode } from './theme-context';

describe('ThemeContext', () => {
  beforeEach(() => {
    // localStorageをクリア
    localStorage.clear();
    // matchMediaのモックをリセット
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
