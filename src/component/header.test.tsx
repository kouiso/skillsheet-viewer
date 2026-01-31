import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Header from './header';
import { ThemeModeProvider } from '@/context/theme-context';

// framer-motionをモック
vi.mock('framer-motion', () => ({
  motion: {
    header: ({ children, ...props }: { children: React.ReactNode }) => (
      <header {...props}>{children}</header>
    ),
    div: ({ children, ...props }: { children: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: { children: React.ReactNode }) => (
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
    it('テーマ切り替えボタンをクリックするとテーマが切り替わること', async () => {
      const user = userEvent.setup();
      renderHeader();

      const themeButton = screen.getByLabelText('テーマ切り替え');

      // クリックしてテーマを切り替え
      await user.click(themeButton);

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('dark');
      });

      // もう一度クリックしてライトモードに戻す
      await user.click(themeButton);

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('light');
      });
    });
  });

  describe('ログアウト機能', () => {
    it('ログアウトボタンをクリックするとsessionStorageがクリアされること', async () => {
      const user = userEvent.setup();
      sessionStorage.setItem('viewer-authenticated', 'true');

      renderHeader();

      const logoutButton = screen.getByLabelText('ログアウト');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(sessionStorage.getItem('viewer-authenticated')).toBeNull();
      });
    });

    it('ログアウトボタンをクリックすると/viewer-authに遷移すること', async () => {
      const user = userEvent.setup();
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
      expect(pdfButton).toBeDisabled();
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
    it('ヘッダーコンポーネントが正しくレンダリングされること', () => {
      const { container } = renderHeader();
      expect(container.querySelector('header')).toBeInTheDocument();
    });
  });
});
