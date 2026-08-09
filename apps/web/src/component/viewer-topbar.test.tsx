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
 * 添字 0 が SP 用、1 が デスクトップ用。
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

  it('固定slotは閲覧者・編集者の両状態で44pxを維持する', () => {
    const { unmount } = renderTopbar({ canEdit: false, reserveEditSlot: true });
    expect(screen.getByTestId('edit-slot')).toHaveClass('size-11', 'shrink-0');
    expect(screen.queryByLabelText('編集／ビルダー')).not.toBeInTheDocument();
    unmount();

    renderTopbar({ canEdit: true, reserveEditSlot: true });
    expect(screen.getByTestId('edit-slot')).toHaveClass('size-11', 'shrink-0');
    expect(screen.getByLabelText('編集／ビルダー')).toBeInTheDocument();
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

  describe('SP のヘッダーを2段に保つ（#190 回帰: 氏名未入力で3段になる不具合）', () => {
    it('戻るリンクと SP 用アイコン群は同じ折り返さないコンテナに入る', () => {
      renderTopbar();
      const backLink = screen.getByLabelText('シート一覧へ戻る');
      const [spTheme] = getIconCopies('テーマ切り替え');
      const row = backLink.parentElement as HTMLElement;

      // 親は flex-wrap のため、リンクとアイコンを別々の子にすると
      // 「縮む前に折り返す」flexbox の挙動でアイコンが2段目へ落ちる。
      expect(row.contains(spTheme)).toBe(true);
      // SP は w-full で1行を占有し、sm 以上で w-auto + flex-1 のスペーサーになる。
      expect(row.className).toContain('w-full');
      expect(row.className).toContain('sm:w-auto');
      expect(row.className).toContain('sm:flex-1');
      // SP で flex-1 を付けると flex-basis:0 が w-full を打ち消して行を占有できなくなる。
      expect(row.className).not.toMatch(/(?<!sm:)\bflex-1\b/);
    });

    it('氏名が未入力でも既定タイトルが省略記号に逃げ、リンクが行を押し広げない', () => {
      renderTopbar({ name: undefined });
      const backLink = screen.getByLabelText('シート一覧へ戻る');
      const label = screen.getByText('エンジニアスキルシート');

      // SP は縮小可能、sm 以上は自然幅を維持（デスクトップで氏名が潰れる回帰の防止）。
      expect(backLink.className).toContain('min-w-0');
      expect(backLink.className).toContain('sm:min-w-fit');
      expect(label.className).toContain('truncate');
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
