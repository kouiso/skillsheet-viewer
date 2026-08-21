import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import CodeBlock from './code-block';

// コピー失敗の通知先。実際の toast は Toaster の描画に依存するので、呼ばれたことだけを見る。
// renderWithProviders が同じモジュールの Toaster を描画するため、部分モックにする。
const toastError = vi.fn();
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>();
  return { ...actual, toast: { ...actual.toast, error: (...args: unknown[]) => toastError(...args) } };
});

// framer-motion をモック（CodeBlock 自体は未使用だが、依存の安全のため）
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        const Passthrough = ({ children, ...props }: { children?: React.ReactNode }) => {
          const rest = { ...props } as Record<string, unknown>;
          for (const key of ['initial', 'animate', 'transition', 'whileHover', 'whileTap', 'exit', 'variants']) {
            delete rest[key];
          }
          return <div {...rest}>{children}</div>;
        };
        return Passthrough;
      },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderCodeBlock = (props = {}) => {
  const defaultProps = {
    children: 'const greeting = "Hello, World!";',
    className: 'language-javascript',
    ...props,
  };
  return renderWithProviders(<CodeBlock {...defaultProps} />);
};

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('言語ラベルが表示されること', () => {
      const { container } = renderCodeBlock();
      expect(within(container).getByText('javascript')).toBeInTheDocument();
    });

    it('コードの内容が（トークン分割されても）テキストとして含まれること', () => {
      const { container } = renderCodeBlock();
      const text = container.textContent ?? '';
      expect(text).toContain('const');
      expect(text).toContain('greeting');
      expect(text).toContain('Hello, World!');
    });

    it('classNameが無い場合は "code" と表示されること', () => {
      const { container } = renderCodeBlock({ className: undefined, children: 'plain' });
      expect(within(container).getByText('code')).toBeInTheDocument();
    });
  });

  describe('コピー機能', () => {
    it('コピーボタンが存在すること', () => {
      renderCodeBlock();
      expect(screen.getByRole('button', { name: 'コードをコピー' })).toBeInTheDocument();
    });

    it('ボタン押下でクリップボードにコードが書き込まれること', async () => {
      const user = userEvent.setup();

      renderCodeBlock();
      await user.click(screen.getByRole('button', { name: 'コードをコピー' }));

      await waitFor(async () => {
        expect(await navigator.clipboard.readText()).toBe('const greeting = "Hello, World!";');
      });
    });

    it('クリップボードが使えないとき、失敗が toast で伝わりコピー済み表示にならない', async () => {
      const user = userEvent.setup();
      // 平文 HTTP 配信や権限拒否では writeText が reject する。捕捉していないと
      // 未処理の rejection になり、利用者には「押しても何も起きない」だけが残る。
      const writeText = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

      renderCodeBlock();
      await user.click(screen.getByRole('button', { name: 'コードをコピー' }));

      await waitFor(() => {
        expect(toastError).toHaveBeenCalledWith('コピーできませんでした。手動で選択してコピーしてください。');
      });
      // 失敗したのに「コピーしました」表示へ切り替わらない。
      expect(screen.getByRole('button', { name: 'コードをコピー' })).toBeInTheDocument();
      writeText.mockRestore();
    });
  });

  describe('アクセシビリティ', () => {
    it('コピーボタンに aria-label が付与されていること', () => {
      renderCodeBlock();
      expect(screen.getByLabelText('コードをコピー')).toBeInTheDocument();
    });
  });

  describe('エッジケース', () => {
    it('特殊文字を含むコードでもクラッシュせず描画できること', () => {
      const { container } = renderCodeBlock({ children: 'const re = /[<>&"\']/g;' });
      expect(container.textContent ?? '').toContain('const');
    });

    it('空のコードでもクラッシュしないこと', () => {
      expect(() => renderCodeBlock({ children: '' })).not.toThrow();
    });
  });
});
