import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeModeProvider } from '@/context/theme-context';

import Header from './header';

// framer-motion をモック（motion.header 等すべてのタグに対応）
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t, tag: string) => {
        const Passthrough = ({ children, ...props }: { children?: React.ReactNode }) => {
          const rest = { ...props } as Record<string, unknown>;
          for (const key of ['initial', 'animate', 'transition', 'whileHover', 'whileTap', 'exit', 'variants']) {
            delete rest[key];
          }
          const Tag = tag as keyof React.JSX.IntrinsicElements;
          return <Tag {...rest}>{children}</Tag>;
        };
        return Passthrough;
      },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderHeader = (props = {}) =>
  render(
    <ThemeModeProvider>
      <TooltipProvider delayDuration={0}>
        <Header {...props} />
      </TooltipProvider>
    </ThemeModeProvider>,
  );

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.classList.remove('dark');
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
      expect(screen.getByLabelText('テーマ切り替え')).toBeInTheDocument();
    });

    it('PDFダウンロードボタンが onDownloadPdf prop の有無で出し分けされること', () => {
      const { unmount } = renderHeader({ onDownloadPdf: vi.fn() });
      expect(screen.getByLabelText('PDFダウンロード')).toBeInTheDocument();
      unmount();

      renderHeader();
      expect(screen.queryByLabelText('PDFダウンロード')).not.toBeInTheDocument();
    });
  });

  describe('PDF機能', () => {
    it('クリックで onDownloadPdf が呼ばれること', async () => {
      const user = userEvent.setup();
      const onDownloadPdf = vi.fn();
      renderHeader({ onDownloadPdf });

      await user.click(screen.getByLabelText('PDFダウンロード'));
      expect(onDownloadPdf).toHaveBeenCalledTimes(1);
    });

    it('pdfLoading 中はボタンが無効化されること', () => {
      renderHeader({ onDownloadPdf: vi.fn(), pdfLoading: true });
      expect(screen.getByLabelText('PDFダウンロード')).toBeDisabled();
    });

    it('pdfLoading でない場合はボタンが有効であること', () => {
      renderHeader({ onDownloadPdf: vi.fn(), pdfLoading: false });
      expect(screen.getByLabelText('PDFダウンロード')).not.toBeDisabled();
    });
  });

  describe('アクセシビリティ', () => {
    it('各ボタンに適切な aria-label が設定されていること', () => {
      renderHeader({ onDownloadPdf: vi.fn() });
      expect(screen.getByLabelText('テーマ切り替え')).toHaveAttribute('aria-label', 'テーマ切り替え');
      expect(screen.getByLabelText('PDFダウンロード')).toHaveAttribute('aria-label', 'PDFダウンロード');
    });
  });
});
