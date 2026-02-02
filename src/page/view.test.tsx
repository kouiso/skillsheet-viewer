import { describe, it, expect, beforeEach, vi, afterEach, Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ViewPage from './view';

// framer-motionをモック
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial,
      animate,
      transition,
      ...props
    }: {
      children: React.ReactNode;
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
    button: ({
      children,
      whileHover,
      whileTap,
      ...props
    }: {
      children: React.ReactNode;
      whileHover?: unknown;
      whileTap?: unknown;
    }) => <button {...props}>{children}</button>,
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

// github-clientのモック
const mockFetchSkillSheet = vi.fn();
vi.mock('@/lib/github-client', () => ({
  fetchSkillSheet: () => mockFetchSkillSheet(),
}));

// Headerコンポーネントのモック
vi.mock('@/component/header', () => ({
  __esModule: true,
  default: ({
    onDownloadPdf,
    pdfLoading,
  }: {
    onDownloadPdf?: () => void;
    pdfLoading?: boolean;
  }) => (
    <div data-testid="header">
      {onDownloadPdf && (
        <button
          onClick={onDownloadPdf}
          disabled={pdfLoading}
          data-testid="pdf-download-button"
          aria-label="PDFダウンロード"
        >
          {pdfLoading ? 'ダウンロード中...' : 'PDFダウンロード'}
        </button>
      )}
    </div>
  ),
}));

// SkillSheetViewerコンポーネントのモック
vi.mock('@/component/skill-sheet-viewer', () => ({
  __esModule: true,
  default: ({ skillSheet }: { skillSheet: { title: string; content: string } }) => (
    <div data-testid="skill-sheet-viewer">
      <h1>{skillSheet.title}</h1>
      <div>{skillSheet.content}</div>
    </div>
  ),
}));

// pdf-exportのモック
const mockPdfToBlob = vi.fn();
vi.mock('@react-pdf/renderer', () => ({
  pdf: () => ({
    toBlob: mockPdfToBlob,
  }),
}));

vi.mock('@/component/pdf-export', () => ({
  SkillSheetPDF: ({ title, content }: { title: string; content: string }) => (
    <div data-testid="skill-sheet-pdf">
      {title} - {content}
    </div>
  ),
}));

const theme = createTheme();

const renderWithProviders = (ui: React.ReactNode) => {
  return render(
    <BrowserRouter>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </BrowserRouter>,
  );
};

describe('ViewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // デフォルトで認証済みとして設定
    sessionStorage.setItem('viewer-authenticated', 'true');
    // デフォルトのfetchSkillSheetモック
    mockFetchSkillSheet.mockResolvedValue({
      content: '# テストコンテンツ',
      sha: 'test-sha',
      lastModified: '2024-01-01',
    });
    // URLのモック
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('認証チェック', () => {
    it('未認証の場合、/viewer-authにリダイレクトされること', async () => {
      sessionStorage.removeItem('viewer-authenticated');

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/viewer-auth');
      });
    });

    it('認証済みの場合、リダイレクトされないこと', async () => {
      sessionStorage.setItem('viewer-authenticated', 'true');

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith('/viewer-auth');
      });
    });

    it('認証値がtrueでない場合、リダイレクトされること', async () => {
      sessionStorage.setItem('viewer-authenticated', 'false');

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/viewer-auth');
      });
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はCircularProgressが表示されること', () => {
      // 遅延させてローディング状態をテスト
      mockFetchSkillSheet.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000)),
      );

      renderWithProviders(<ViewPage />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('データ取得完了後にローディングが消えること', async () => {
      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('スキルシート読み込み', () => {
    it('スキルシートが正しく読み込まれて表示されること', async () => {
      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByTestId('skill-sheet-viewer')).toBeInTheDocument();
        expect(screen.getByText('エンジニアスキルシート')).toBeInTheDocument();
      });
    });

    it('fetchSkillSheetが呼び出されること', async () => {
      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(mockFetchSkillSheet).toHaveBeenCalled();
      });
    });

    it('コンテンツがSkillSheetViewerに渡されること', async () => {
      mockFetchSkillSheet.mockResolvedValue({
        content: '# 特別なコンテンツ',
        sha: 'test-sha',
        lastModified: '2024-01-01',
      });

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByText('# 特別なコンテンツ')).toBeInTheDocument();
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('読み込みエラー時にエラーメッセージが表示されること', async () => {
      mockFetchSkillSheet.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByText('エラー')).toBeInTheDocument();
        expect(screen.getByText('エンジニアスキルシートの読み込みに失敗しました。')).toBeInTheDocument();
      });
    });

    it('エラー時にSkillSheetViewerが表示されないこと', async () => {
      mockFetchSkillSheet.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.queryByTestId('skill-sheet-viewer')).not.toBeInTheDocument();
      });
    });

    it('エラー後にコンソールエラーが出力されること', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchSkillSheet.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error fetching skill sheet:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('PDF機能', () => {
    it('Headerコンポーネントが表示されること', async () => {
      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByTestId('header')).toBeInTheDocument();
      });
    });

    it('PDFダウンロードボタンが表示されること', async () => {
      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pdf-download-button')).toBeInTheDocument();
      });
    });

    it('PDFダウンロードボタンクリックでPDFが生成されること', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockPdfToBlob.mockResolvedValue(mockBlob);

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pdf-download-button')).toBeInTheDocument();
      });

      const button = screen.getByTestId('pdf-download-button');
      await user.click(button);

      await waitFor(() => {
        expect(mockPdfToBlob).toHaveBeenCalled();
      });
    });

    it('PDF生成成功時にSnackbarが表示されること', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockPdfToBlob.mockResolvedValue(mockBlob);

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pdf-download-button')).toBeInTheDocument();
      });

      const button = screen.getByTestId('pdf-download-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('PDFのダウンロードが完了しました')).toBeInTheDocument();
      });
    });

    it('PDF生成失敗時にエラーSnackbarが表示されること', async () => {
      const user = userEvent.setup();
      mockPdfToBlob.mockRejectedValue(new Error('PDF Error'));

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pdf-download-button')).toBeInTheDocument();
      });

      const button = screen.getByTestId('pdf-download-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('PDFの生成に失敗しました')).toBeInTheDocument();
      });
    });

    it('PDF生成中はボタンが無効化されること', async () => {
      const user = userEvent.setup();
      // 遅延させてローディング状態をテスト
      mockPdfToBlob.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000)),
      );

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pdf-download-button')).toBeInTheDocument();
      });

      const button = screen.getByTestId('pdf-download-button');
      await user.click(button);

      await waitFor(() => {
        expect(button).toBeDisabled();
        expect(button).toHaveTextContent('ダウンロード中...');
      });
    });
  });

  describe('Snackbar機能', () => {
    it('Snackbarが閉じられること', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockPdfToBlob.mockResolvedValue(mockBlob);

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pdf-download-button')).toBeInTheDocument();
      });

      // Snackbarを表示
      const button = screen.getByTestId('pdf-download-button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('PDFのダウンロードが完了しました')).toBeInTheDocument();
      });

      // 閉じるボタンをクリック
      const closeButton = screen.getByRole('button', { name: 'Close' });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('PDFのダウンロードが完了しました')).not.toBeInTheDocument();
      });
    });
  });

  describe('スキルシートがnullの場合', () => {
    it('ローディング中でなくエラーもなくスキルシートがnullの場合、何も表示されないこと', async () => {
      // このケースはfetchSkillSheetが成功するがnullを返す場合
      // 実際のコードではこのケースは発生しないが、テストのためにモック
      mockFetchSkillSheet.mockResolvedValue(null);

      renderWithProviders(<ViewPage />);

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.queryByTestId('skill-sheet-viewer')).not.toBeInTheDocument();
      });
    });
  });
});
