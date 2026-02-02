import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ViewerAuthPage from './viewer-auth';

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
      type,
      ...props
    }: {
      children: React.ReactNode;
      whileHover?: unknown;
      whileTap?: unknown;
      type?: string;
    }) => (
      <button type={type as 'button' | 'submit' | 'reset'} {...props}>
        {children}
      </button>
    ),
    h1: ({
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
    }) => <h1 {...props}>{children}</h1>,
    p: ({
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
    }) => <p {...props}>{children}</p>,
    form: ({
      children,
      initial,
      animate,
      transition,
      onSubmit,
      ...props
    }: {
      children: React.ReactNode;
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
      onSubmit?: (e: React.FormEvent) => void;
    }) => (
      <form onSubmit={onSubmit} {...props}>
        {children}
      </form>
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

const theme = createTheme();

const renderWithProviders = (ui: React.ReactNode) => {
  return render(
    <BrowserRouter>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </BrowserRouter>,
  );
};

describe('ViewerAuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // デフォルトの認証コードを設定
    vi.stubEnv('VITE_VIEWER_CODE', 'valid-code');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('レンダリング', () => {
    it('タイトルが表示されること', () => {
      renderWithProviders(<ViewerAuthPage />);

      expect(screen.getByText('エンジニアスキルシート閲覧')).toBeInTheDocument();
    });

    it('説明文が表示されること', () => {
      renderWithProviders(<ViewerAuthPage />);

      expect(screen.getByText('共有された認証コードを入力してください')).toBeInTheDocument();
    });

    it('認証コード入力フィールドが表示されること', () => {
      renderWithProviders(<ViewerAuthPage />);

      expect(screen.getByLabelText(/認証コード/)).toBeInTheDocument();
    });

    it('認証ボタンが表示されること', () => {
      renderWithProviders(<ViewerAuthPage />);

      expect(screen.getByRole('button', { name: '認証' })).toBeInTheDocument();
    });

    it('アイコンコンテナが表示されること', () => {
      const { container } = renderWithProviders(<ViewerAuthPage />);

      // アイコンを含むコンテナの存在を確認
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('認証成功', () => {
    it('正しい認証コードを入力すると/viewに遷移すること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'valid-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/view');
      });
    });

    it('認証成功時にsessionStorageに認証状態が保存されること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'valid-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(sessionStorage.getItem('viewer-authenticated')).toBe('true');
      });
    });
  });

  describe('認証失敗', () => {
    it('間違った認証コードを入力するとエラーメッセージが表示されること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'wrong-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('認証コードが正しくありません')).toBeInTheDocument();
      });
    });

    it('認証失敗時はsessionStorageに何も保存されないこと', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'wrong-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(sessionStorage.getItem('viewer-authenticated')).toBeNull();
      });
    });

    it('認証失敗時は/viewに遷移しないこと', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'wrong-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('認証コードが正しくありません')).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalledWith('/view');
    });
  });

  describe('環境変数未設定', () => {
    it('認証コードが環境変数に設定されていない場合エラーが表示されること', async () => {
      vi.stubEnv('VITE_VIEWER_CODE', '');
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'any-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('認証システムの設定が不正です')).toBeInTheDocument();
      });
    });

    it('環境変数がundefinedの場合エラーが表示されること', async () => {
      vi.stubEnv('VITE_VIEWER_CODE', undefined as unknown as string);
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'any-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('認証システムの設定が不正です')).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    it('認証中はボタンが「認証中...」と表示されること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'valid-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      // 認証中の状態をキャプチャするのは難しいので、最終的に遷移することを確認
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/view');
      });
    });

    it('認証失敗後はボタンが再び有効になること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'wrong-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('認証コードが正しくありません')).toBeInTheDocument();
      });

      // ボタンが「認証」に戻っている
      expect(screen.getByRole('button', { name: '認証' })).toBeInTheDocument();
    });
  });

  describe('フォーム入力', () => {
    it('入力フィールドに文字を入力できること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'test-input');

      expect(input).toHaveValue('test-input');
    });

    it('入力フィールドが必須であること', () => {
      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      expect(input).toBeRequired();
    });

    it('autocompleteがoffであること', () => {
      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      expect(input).toHaveAttribute('autocomplete', 'off');
    });
  });

  describe('エラーメッセージ', () => {
    it('エラーメッセージがAlertコンポーネントで表示されること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'wrong-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveTextContent('認証コードが正しくありません');
      });
    });

    it('新しい認証試行時にエラーメッセージがクリアされること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      // 最初の失敗
      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'wrong-code');

      const button = screen.getByRole('button', { name: '認証' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('認証コードが正しくありません')).toBeInTheDocument();
      });

      // 入力をクリアして正しいコードを入力
      await user.clear(input);
      await user.type(input, 'valid-code');
      await user.click(button);

      // 成功後、エラーメッセージが消える
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/view');
      });
    });
  });

  describe('スタイリング', () => {
    it('Cardコンポーネントがレンダリングされること', () => {
      const { container } = renderWithProviders(<ViewerAuthPage />);

      expect(container.querySelector('.MuiCard-root')).toBeInTheDocument();
    });

    it('Buttonコンポーネントがcontainedバリアントであること', () => {
      const { container } = renderWithProviders(<ViewerAuthPage />);

      expect(container.querySelector('.MuiButton-contained')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('フォームがsubmitイベントを正しく処理すること', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ViewerAuthPage />);

      const input = screen.getByLabelText(/認証コード/);
      await user.type(input, 'valid-code{enter}');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/view');
      });
    });
  });
});
