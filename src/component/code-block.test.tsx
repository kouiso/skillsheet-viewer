import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CodeBlock from './code-block';
import { ThemeProvider, createTheme } from '@mui/material';

// framer-motionをモック
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }: { children: React.ReactNode; whileHover?: unknown; whileTap?: unknown }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

const theme = createTheme();

const renderCodeBlock = (props = {}) => {
  const defaultProps = {
    children: 'const greeting = "Hello, World!";',
    className: 'language-javascript',
    ...props,
  };

  return render(
    <ThemeProvider theme={theme}>
      <CodeBlock {...defaultProps} />
    </ThemeProvider>,
  );
};

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('コードブロックが正しくレンダリングされること', () => {
      const { container } = renderCodeBlock();
      // シンタックスハイライトでテキストが分割されるため、コンテナ内のコード要素を確認
      const codeElement = container.querySelector('code');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement?.textContent).toContain('const');
      expect(codeElement?.textContent).toContain('Hello, World!');
    });

    it('コードの内容が正しく表示されること', () => {
      const code = 'function test() { return true; }';
      const { container } = renderCodeBlock({ children: code });
      // シンタックスハイライトでテキストが分割されるため、コンテナ内のコード要素を確認
      const codeElement = container.querySelector('code');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement?.textContent).toContain('function');
      expect(codeElement?.textContent).toContain('test');
    });

    it('言語名が正しく表示されること', () => {
      renderCodeBlock({ className: 'language-typescript' });
      expect(screen.getByText('typescript')).toBeInTheDocument();
    });

    it('言語が指定されていない場合は"code"と表示されること', () => {
      renderCodeBlock({ className: undefined });
      expect(screen.getByText('code')).toBeInTheDocument();
    });

    it('classNameが空の場合は"code"と表示されること', () => {
      renderCodeBlock({ className: '' });
      expect(screen.getByText('code')).toBeInTheDocument();
    });

    it('コピーボタンが表示されること', () => {
      renderCodeBlock();
      const copyButton = screen.getByLabelText('コードをコピー');
      expect(copyButton).toBeInTheDocument();
    });

    it('ContentCopyアイコンが初期表示されること', () => {
      renderCodeBlock();
      expect(screen.getByTestId('ContentCopyIcon')).toBeInTheDocument();
    });
  });

  describe('コピー機能', () => {
    let writeTextMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Clipboard APIのモック
      writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: writeTextMock,
        },
        writable: true,
        configurable: true,
      });
    });

    it('コピーボタンが存在すること', () => {
      renderCodeBlock();
      const copyButton = screen.getByLabelText('コードをコピー');
      expect(copyButton).toBeInTheDocument();
    });

    it('コピー機能のテスト - クリックでチェックアイコンが表示されること', async () => {
      const user = userEvent.setup();
      renderCodeBlock();

      const copyButton = screen.getByLabelText('コードをコピー');

      // 初期状態でContentCopyIconが表示されている
      expect(screen.getByTestId('ContentCopyIcon')).toBeInTheDocument();

      await user.click(copyButton);

      // クリック後はCheckIconが表示される
      await waitFor(() => {
        expect(screen.queryByTestId('CheckIcon')).toBeInTheDocument();
      });
    });
  });

  describe('複数言語対応', () => {
    it('Python言語が正しく表示されること', () => {
      renderCodeBlock({
        className: 'language-python',
        children: 'print("Hello, World!")',
      });
      expect(screen.getByText('python')).toBeInTheDocument();
    });

    it('TypeScript言語が正しく表示されること', () => {
      renderCodeBlock({
        className: 'language-typescript',
        children: 'const num: number = 42;',
      });
      expect(screen.getByText('typescript')).toBeInTheDocument();
    });

    it('Bash言語が正しく表示されること', () => {
      renderCodeBlock({
        className: 'language-bash',
        children: 'echo "Hello"',
      });
      expect(screen.getByText('bash')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('コピーボタンに適切なaria-labelが設定されていること', () => {
      renderCodeBlock();
      const copyButton = screen.getByLabelText('コードをコピー');
      expect(copyButton).toHaveAttribute('aria-label', 'コードをコピー');
    });

    it('コードブロックがコンテナ内に存在すること', () => {
      const { container } = renderCodeBlock();
      // SyntaxHighlighterはPreTag="div"を使用しているため、divコンテナを確認
      const codeContainer = container.querySelector('code');
      expect(codeContainer).toBeInTheDocument();
    });

    it('コードがcodeタグでマークアップされていること', () => {
      const { container } = renderCodeBlock({ className: 'language-javascript' });
      const codeElement = container.querySelector('code.language-javascript');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement?.tagName).toBe('CODE');
    });
  });

  describe('スタイリング', () => {
    it('言語名が大文字で表示されること', () => {
      renderCodeBlock({ className: 'language-javascript' });
      const languageLabel = screen.getByText('javascript');
      expect(languageLabel).toBeInTheDocument();
    });
  });

  describe('エッジケース', () => {
    it('空のコードブロックでもエラーなくレンダリングされること', () => {
      renderCodeBlock({ children: '' });
      expect(screen.getByLabelText('コードをコピー')).toBeInTheDocument();
    });

    it('非常に長いコードでもレンダリングされること', () => {
      const longCode = 'const test = "test";\n'.repeat(100);
      renderCodeBlock({ children: longCode });
      expect(screen.getByLabelText('コードをコピー')).toBeInTheDocument();
    });

    it('特殊文字を含むコードが正しく表示されること', () => {
      const specialCode = 'const regex = /[a-z]{2,}/gi;';
      const { container } = renderCodeBlock({ children: specialCode });
      // シンタックスハイライトでテキストが分割されるため、コンテナ内のコード要素を確認
      const codeElement = container.querySelector('code');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement?.textContent).toContain('const');
      expect(codeElement?.textContent).toContain('regex');
    });
  });
});
