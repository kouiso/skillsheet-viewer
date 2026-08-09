import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeModeProvider } from '@/context/theme-context';

import { ALL_VIEW_KEYS, ViewerTopbar } from './viewer-topbar';

// framer-motion をモック（header.test.tsx と同じパターン）。
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

const renderTopbar = (props = {}) =>
  render(
    <ThemeModeProvider>
      <TooltipProvider delayDuration={0}>
        <ViewerTopbar views={[...ALL_VIEW_KEYS]} onToggleView={vi.fn()} {...props} />
      </TooltipProvider>
    </ThemeModeProvider>,
  );

/**
 * アイコン群は SP 用（sm:hidden）とデスクトップ用（hidden sm:flex）を DOM に両方出し、
 * 表示側を CSS で切り替えている。jsdom は CSS を適用しないため両方が取得できる。
 * 添字 0 が SP 用、1 がデスクトップ用。
 */
const getIconCopies = (label: string) => screen.getAllByLabelText(label);

describe('ViewerTopbar', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.clearAllMocks();
  });

  it('一覧（/view）へ戻るリンクが常に出る（#149 U-3）', () => {
    renderTopbar();
    expect(screen.getByLabelText('シート一覧へ戻る')).toHaveAttribute('href', '/view');
  });

  it('canEdit を省略すると編集ボタンが出る（既定は互換維持）', () => {
    renderTopbar();
    expect(getIconCopies('編集／ビルダー')).toHaveLength(2);
  });

  it('canEdit=false のとき編集ボタンが出ない（閲覧コードのみのユーザー向け、#149 U-4）', () => {
    renderTopbar({ canEdit: false });
    expect(screen.queryByLabelText('編集／ビルダー')).not.toBeInTheDocument();
  });

  describe('DOM順と視覚順の一致（レビュー指摘: キーボードのタブ順・読み上げ順の対策）', () => {
    it('SP 用アイコン群 → ビュートグル → デスクトップ用アイコン群 の順に並ぶ', () => {
      renderTopbar();
      const backLink = screen.getByLabelText('シート一覧へ戻る');
      const [spTheme, desktopTheme] = getIconCopies('テーマ切り替え');
      const firstViewToggle = screen.getByRole('button', { name: 'スキルマトリクス' });

      // 戻るリンク → SP用アイコン群 → ビュートグル → デスクトップ用アイコン群
      expect(backLink.compareDocumentPosition(spTheme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(spTheme.compareDocumentPosition(firstViewToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(firstViewToggle.compareDocumentPosition(desktopTheme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('表示切り替えは CSS の出し分けで行い、order-* も useMediaQuery も使わない', () => {
      const { container } = renderTopbar();
      const [spTheme, desktopTheme] = getIconCopies('テーマ切り替え');

      // SP 用は sm 以上で display:none、デスクトップ用は sm 未満で display:none。
      expect(spTheme.closest('div')?.className).toContain('sm:hidden');
      expect(desktopTheme.closest('div')?.className).toContain('hidden');
      expect(desktopTheme.closest('div')?.className).toContain('sm:flex');

      // order-* が残っていると DOM順と視覚順が再びズレるため、使っていないことを固定する。
      expect(container.innerHTML).not.toMatch(/\border-\d\b/);
      expect(container.innerHTML).not.toMatch(/\bsm:order-\d\b/);
    });
  });

  describe('PDF ダウンロードの生成中フィードバック（#191）', () => {
    it('通常時は「PDFダウンロード」ラベルで押せる', () => {
      renderTopbar({ onDownloadPdf: vi.fn() });
      for (const button of getIconCopies('PDFダウンロード')) {
        expect(button).toBeEnabled();
        expect(button).toHaveAttribute('aria-busy', 'false');
      }
    });

    it('pdfLoading 中は無効化され、aria-busy と「PDFを生成中」ラベルで状態を伝える', () => {
      renderTopbar({ onDownloadPdf: vi.fn(), pdfLoading: true });
      const buttons = getIconCopies('PDFを生成中');
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
      }
      expect(screen.queryByLabelText('PDFダウンロード')).not.toBeInTheDocument();
    });

    it('onDownloadPdf 未指定なら PDF ボタン自体を出さない', () => {
      renderTopbar();
      expect(screen.queryByLabelText('PDFダウンロード')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('PDFを生成中')).not.toBeInTheDocument();
    });
  });
});
