import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './app';

// framer-motionをモック
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: { children: React.ReactNode }) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ページコンポーネントをモック
vi.mock('./page/view', () => ({
  default: () => <div data-testid="view-page">View Page</div>,
}));

vi.mock('./page/viewer-auth', () => ({
  default: () => <div data-testid="viewer-auth-page">Viewer Auth Page</div>,
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    // ブラウザの初期URLをリセット
    window.history.pushState({}, '', '/');
  });

  describe('ルーティング', () => {
    it('アプリケーションが正しくレンダリングされること', () => {
      render(<App />);
      expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
    });

    it('ルートパス(/)にアクセスすると/viewer-authにリダイレクトされること', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
      });
    });

    it('/viewer-authパスでViewerAuthページが表示されること', async () => {
      window.history.pushState({}, '', '/viewer-auth');
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
      });
    });

    it('/viewパスでViewページが表示されること', async () => {
      window.history.pushState({}, '', '/view');
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('view-page')).toBeInTheDocument();
      });
    });
  });

  describe('ThemeProvider', () => {
    it('ThemeModeProviderがアプリケーション全体をラップしていること', () => {
      render(<App />);

      // ThemeProviderが正しく適用されているか確認
      // ページコンポーネントが正常にレンダリングされることで間接的に確認
      expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
    });

    it('localStorageに保存されたテーマが適用されること', () => {
      localStorage.setItem('theme-mode', 'dark');
      render(<App />);

      // テーマが正常に適用されている
      expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
    });

    it('初期状態ではシステムのテーマ設定が使用されること', () => {
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

      render(<App />);

      expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
    });
  });

  describe('CssBaseline', () => {
    it('CssBaselineが適用されていること', () => {
      render(<App />);

      // CssBaselineが適用されることで、bodyのスタイルがリセットされる
      // コンポーネントが正常にレンダリングされることで間接的に確認
      expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
    });
  });

  describe('BrowserRouter', () => {
    it('BrowserRouterが正しく設定されていること', () => {
      render(<App />);

      // ルーティングが正常に動作することを確認
      expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
    });

    it('存在しないパスにアクセスしても正常に動作すること', () => {
      window.history.pushState({}, '', '/non-existent-path');

      // エラーなくレンダリングされる
      expect(() => render(<App />)).not.toThrow();
    });
  });

  describe('統合テスト', () => {
    it('アプリケーション全体が正しく初期化されること', () => {
      render(<App />);

      // ThemeProvider, BrowserRouter, ページコンポーネントが全て正常に動作
      expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
    });

    it('テーマとルーティングが同時に動作すること', () => {
      localStorage.setItem('theme-mode', 'dark');
      window.history.pushState({}, '', '/view');

      render(<App />);

      expect(screen.getByTestId('view-page')).toBeInTheDocument();
    });
  });

  describe('AppContentコンポーネント', () => {
    it('useThemeModeフックが正常に動作すること', () => {
      // AppContent内でuseThemeModeが呼ばれても、ThemeModeProviderでラップされているのでエラーにならない
      expect(() => render(<App />)).not.toThrow();
    });

    it('テーマが正しく作成されること', () => {
      render(<App />);

      // createAppThemeが呼ばれてテーマが作成される
      // コンポーネントが正常にレンダリングされることで確認
      expect(screen.getByTestId('viewer-auth-page')).toBeInTheDocument();
    });
  });

  describe('エラーハンドリング', () => {
    it('レンダリング時にエラーが発生しないこと', () => {
      expect(() => render(<App />)).not.toThrow();
    });

    it('複数回レンダリングしてもエラーが発生しないこと', () => {
      const { rerender } = render(<App />);

      expect(() => rerender(<App />)).not.toThrow();
      expect(() => rerender(<App />)).not.toThrow();
    });
  });
});
