import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Header from './header';
import { ThemeModeProvider } from '@/context/theme-context';

// framer-motionをモック
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, transition, ...props }: { children: React.ReactNode; initial?: unknown; animate?: unknown; transition?: unknown }) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, whileHover, whileTap, ...props }: { children: React.ReactNode; whileHover?: unknown; whileTap?: unknown }) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// react-router-domのモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderHeader = (props = {}) => {
  return render(
    <BrowserRouter>
      <ThemeModeProvider>
        <Header {...props} />
      </ThemeModeProvider>
    </BrowserRouter>,
  );
};

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('デフォルトのタイトルが表示されること', () => {
      renderHeader();
      expect(screen.getByText('エンジニアスキルシート')).toBeInTheDocument();
    });

    it('カスタムタイトルが表示されること', () => {
      renderHeader({ title: 'カスタムタイトル' });
      expect(screen.getByText('カスタムタイトル')).toBeInTheDocument();
    });

    it('テーマ切り替えボタンが表示されること', () => {
      renderHeader();
      const themeButton = screen.getByLabelText('テーマ切り替え');
      expect(themeButton).toBeInTheDocument();
    });

    it('ログアウトボタンが表示されること', () => {
      renderHeader();
      const logoutButton = screen.getByLabelText('ログアウト');
      expect(logoutButton).toBeInTheDocument();
    });

    it('Descriptionアイコンが表示されること', () => {
      renderHeader();
      // MUIのDescriptionIconが存在することを確認
      const icon = screen.getByTestId('DescriptionIcon');
      expect(icon).toBeInTheDocument();
    });

    it('PDFダウンロードボタンがonDownloadPdf propがある場合表示されること', () => {
      const mockOnDownloadPdf = vi.fn();
      renderHeader({ onDownloadPdf: mockOnDownloadPdf });
      const pdfButton = screen.getByLabelText('PDFダウンロード');
      expect(pdfButton).toBeInTheDocument();
    });

    it('PDFダウンロードボタンがonDownloadPdf propがない場合表示されないこと', () => {
      renderHeader();
      const pdfButton = screen.queryByLabelText('PDFダウンロード');
      expect(pdfButton).not.toBeInTheDocument();
    });
  });

  describe('テーマ切り替え機能', () => {
    it('ライトモード時にBrightness4アイコンが表示されること', () => {
      renderHeader();
      // ライトモード時のアイコン
      expect(screen.getByTestId('Brightness4Icon')).toBeInTheDocument();
    });

    it('ダークモード時にBrightness7アイコンが表示されること', async () => {
      localStorage.setItem('theme-mode', 'dark');
      renderHeader();

      // ダークモード時のアイコン
      await waitFor(() => {
        expect(screen.getByTestId('Brightness7Icon')).toBeInTheDocument();
      });
    });

    it('テーマ切り替えボタンをクリックするとテーマが切り替わること', async () => {
      const user = userEvent.setup();
      renderHeader();

      const themeButton = screen.getByLabelText('テーマ切り替え');

      // 初期状態はライトモード
      expect(screen.getByTestId('Brightness4Icon')).toBeInTheDocument();

      // クリックしてダークモードに切り替え
      await user.click(themeButton);

      await waitFor(() => {
        expect(screen.getByTestId('Brightness7Icon')).toBeInTheDocument();
      });

      // もう一度クリックしてライトモードに戻す
      await user.click(themeButton);

      await waitFor(() => {
        expect(screen.getByTestId('Brightness4Icon')).toBeInTheDocument();
      });
    });
  });

  describe('ログアウト機能', () => {
    it('ログアウトボタンをクリックするとPOST /api/logoutが呼ばれること', async () => {
      const user = userEvent.setup();
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      renderHeader();

      const logoutButton = screen.getByLabelText('ログアウト');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/logout', expect.objectContaining({ method: 'POST' }));
      });
    });

    it('ログアウトボタンをクリックすると/viewer-authに遷移すること', async () => {
      const user = userEvent.setup();
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      renderHeader();

      const logoutButton = screen.getByLabelText('ログアウト');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/viewer-auth');
      });
    });
  });

  describe('PDF機能', () => {
    it('PDFダウンロードボタンをクリックするとonDownloadPdfが呼ばれること', async () => {
      const user = userEvent.setup();
      const mockOnDownloadPdf = vi.fn();
      renderHeader({ onDownloadPdf: mockOnDownloadPdf });

      const pdfButton = screen.getByLabelText('PDFダウンロード');
      await user.click(pdfButton);

      expect(mockOnDownloadPdf).toHaveBeenCalledTimes(1);
    });

    it('PDFローディング中はボタンが無効化されること', () => {
      const mockOnDownloadPdf = vi.fn();
      renderHeader({ onDownloadPdf: mockOnDownloadPdf, pdfLoading: true });

      const pdfButton = screen.getByLabelText('PDFダウンロード');
      expect(pdfButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('PDFローディング中でない場合はボタンが有効化されること', () => {
      const mockOnDownloadPdf = vi.fn();
      renderHeader({ onDownloadPdf: mockOnDownloadPdf, pdfLoading: false });

      const pdfButton = screen.getByLabelText('PDFダウンロード');
      expect(pdfButton).not.toBeDisabled();
    });
  });

  describe('アクセシビリティ', () => {
    it('テーマ切り替えボタンに適切なaria-labelが設定されていること', () => {
      renderHeader();
      const themeButton = screen.getByLabelText('テーマ切り替え');
      expect(themeButton).toHaveAttribute('aria-label', 'テーマ切り替え');
    });

    it('ログアウトボタンに適切なaria-labelが設定されていること', () => {
      renderHeader();
      const logoutButton = screen.getByLabelText('ログアウト');
      expect(logoutButton).toHaveAttribute('aria-label', 'ログアウト');
    });

    it('PDFダウンロードボタンに適切なaria-labelが設定されていること', () => {
      const mockOnDownloadPdf = vi.fn();
      renderHeader({ onDownloadPdf: mockOnDownloadPdf });
      const pdfButton = screen.getByLabelText('PDFダウンロード');
      expect(pdfButton).toHaveAttribute('aria-label', 'PDFダウンロード');
    });
  });

  describe('スタイリング', () => {
    it('AppBarコンポーネントが正しくレンダリングされること', () => {
      const { container } = renderHeader();
      // AppBarがレンダリングされることを確認
      expect(container.querySelector('.MuiAppBar-root')).toBeInTheDocument();
    });
  });
});
