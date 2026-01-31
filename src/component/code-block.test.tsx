import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CodeBlock from './code-block';
import { ThemeModeProvider } from '@/context/theme-context';

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
}));

const renderCodeBlock = (props = {}) => {
  const defaultProps = {
    children: 'const greeting = "Hello, World!";',
    className: 'language-javascript',
    ...props,
  };

  return render(
    <ThemeModeProvider>
      <CodeBlock {...defaultProps} />
    </ThemeModeProvider>,
  );
};

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('レンダリング', () => {
    it('コードブロックが正しくレンダリングされること', () => {
      const { container } = renderCodeBlock();
      // シンタックスハイライターがコードを複数の要素に分割するため、コンテナのテキストコンテンツを確認
      expect(container.textContent).toContain('const greeting');
      expect(container.textContent).toContain('Hello, World!');
    });

    it('コードの内容が正しく表示されること', () => {
      const code = 'function test() { return true; }';
      const { container } = renderCodeBlock({ children: code });
      // シンタックスハイライターがコードを複数の要素に分割するため、コンテナのテキストコンテンツを確認
      expect(container.textContent).toContain('function test');
      expect(container.textContent).toContain('return true');
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
  });

  describe('コピー機能', () => {
    it('コピーボタンが存在すること', () => {
      renderCodeBlock();
      const copyButton = screen.getByLabelText('コードをコピー');
      expect(copyButton).toBeInTheDocument();
    });

    it('コピー機能のテスト - コピー後にUIが更新されること', async () => {
      // Clipboard APIのモック (navigatorを直接モック)
      const originalClipboard = navigator.clipboard;
      const writeTextMock = vi.fn().mockResolvedValue(undefined);

      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const user = userEvent.setup();
      const { container } = renderCodeBlock();

      const copyButton = screen.getByLabelText('コードをコピー');
      await user.click(copyButton);

      // コピー成功後、UIが更新されることを確認（チェックアイコンが表示される）
      await waitFor(() => {
        const checkIcon = container.querySelector('.lucide-check');
        expect(checkIcon).toBeInTheDocument();
      });

      // クリーンアップ
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('複数言語対応', () => {
    it('Python言語が正しく表示されること', () => {
      const { container } = renderCodeBlock({
        className: 'language-python',
        children: 'print("Hello, World!")',
      });
      expect(screen.getByText('python')).toBeInTheDocument();
      expect(container.textContent).toContain('print');
      expect(container.textContent).toContain('Hello, World!');
    });

    it('TypeScript言語が正しく表示されること', () => {
      const { container } = renderCodeBlock({
        className: 'language-typescript',
        children: 'const num: number = 42;',
      });
      expect(screen.getByText('typescript')).toBeInTheDocument();
      expect(container.textContent).toContain('const num');
      expect(container.textContent).toContain('42');
    });

    it('Bash言語が正しく表示されること', () => {
      const { container } = renderCodeBlock({
        className: 'language-bash',
        children: 'echo "Hello"',
      });
      expect(screen.getByText('bash')).toBeInTheDocument();
      expect(container.textContent).toContain('echo');
      expect(container.textContent).toContain('Hello');
    });
  });

  describe('アクセシビリティ', () => {
    it('コピーボタンに適切なaria-labelが設定されていること', () => {
      renderCodeBlock();
      const copyButton = screen.getByLabelText('コードをコピー');
      expect(copyButton).toHaveAttribute('aria-label', 'コードをコピー');
    });

    it('コードブロックがdivタグでマークアップされていること', () => {
      const { container } = renderCodeBlock();
      // SyntaxHighlighter は PreTag="div" を使用
      const codeWrapper = container.querySelector('div');
      expect(codeWrapper).toBeInTheDocument();
    });

    it('コードがcodeタグでマークアップされていること', () => {
      const { container } = renderCodeBlock({ className: 'language-javascript' });
      const codeElement = container.querySelector('code');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement).toHaveClass('language-javascript');
    });
  });

  describe('スタイリング', () => {
    it('言語名が正しく表示されること', () => {
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
      // シンタックスハイライターがコードを複数の要素に分割するため、コンテナのテキストコンテンツを確認
      expect(container.textContent).toContain('const regex');
      expect(container.textContent).toContain('a-z');
    });
  });
});
