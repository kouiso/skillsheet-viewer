import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/component/ui/tooltip';
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
  useReducedMotion: () => false,
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
      expect(screen.getByLabelText('PDFを生成中')).toBeDisabled();
    });

    it('pdfLoading 中は aria-busy で生成中であることを伝えること（#191）', () => {
      renderHeader({ onDownloadPdf: vi.fn(), pdfLoading: true });
      expect(screen.getByLabelText('PDFを生成中')).toHaveAttribute('aria-busy', 'true');
    });

    it('デスクトップ幅では出力ボタンに PDF / Excel の文字ラベルが付く（#377 D）', () => {
      renderHeader({ onDownloadPdf: vi.fn(), onDownloadExcel: vi.fn() });
      // 絵だけでは何が出るか分からないため、xl 以上で文字を併記する（ViewerTopbar と同じ規則）。
      const pdfLabel = screen.getByLabelText('PDFダウンロード').querySelector('span');
      const excelLabel = screen.getByLabelText('Excelダウンロード').querySelector('span');
      expect(pdfLabel).toHaveTextContent('PDF');
      expect(pdfLabel).toHaveClass('hidden', 'xl:inline');
      expect(excelLabel).toHaveTextContent('Excel');
      expect(excelLabel).toHaveClass('hidden', 'xl:inline');
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

  describe('canEdit / backHref（#149 U-3 / U-4）', () => {
    it('canEdit を省略すると編集ボタンが出る（既定は互換維持）', () => {
      renderHeader();
      expect(screen.getByLabelText('編集／ビルダー')).toBeInTheDocument();
    });

    it('canEdit=false のとき編集ボタンが出ない（閲覧コードのみのユーザー向け）', () => {
      renderHeader({ canEdit: false });
      expect(screen.queryByLabelText('編集／ビルダー')).not.toBeInTheDocument();
    });

    it('固定slotは閲覧者・編集者の両状態で44pxを維持する', () => {
      const { unmount } = renderHeader({ canEdit: false, reserveEditSlot: true });
      expect(screen.getByTestId('edit-slot')).toHaveClass('size-11', 'shrink-0');
      expect(screen.queryByLabelText('編集／ビルダー')).not.toBeInTheDocument();
      unmount();

      renderHeader({ canEdit: true, reserveEditSlot: true });
      expect(screen.getByTestId('edit-slot')).toHaveClass('size-11', 'shrink-0');
      expect(screen.getByLabelText('編集／ビルダー')).toBeInTheDocument();
    });

    it('backHref 未指定では一覧へ戻るリンクが出ない', () => {
      renderHeader();
      expect(screen.queryByLabelText('シート一覧へ戻る')).not.toBeInTheDocument();
    });

    it('backHref 指定時は一覧へ戻るリンクが /view を指す', () => {
      renderHeader({ backHref: '/view' });
      expect(screen.getByLabelText('シート一覧へ戻る')).toHaveAttribute('href', '/view');
    });
  });

  describe('ヘッダー実高の共有（#397）', () => {
    it('レガシーヘッダーも --viewer-topbar-h を documentElement へ書き込む', () => {
      renderHeader();
      // project ブロック無しのシートでも目次サイドバーがこの変数を引くため、
      // ViewerTopbar と同じ実測値の流し方を固定する。jsdom では offsetHeight=0。
      expect(document.documentElement.style.getPropertyValue('--viewer-topbar-h')).toMatch(/^\d+(\.\d+)?px$/);
    });
  });
});
