import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(screen.getByLabelText('編集／ビルダー')).toBeInTheDocument();
  });

  it('canEdit=false のとき編集ボタンが出ない（閲覧コードのみのユーザー向け、#149 U-4）', () => {
    renderTopbar({ canEdit: false });
    expect(screen.queryByLabelText('編集／ビルダー')).not.toBeInTheDocument();
  });

  it('DOM順は SP の視覚順（戻るリンク→アイコン群→ビュートグル）に一致する（レビュー指摘: キーボード/スクリーンリーダーの操作順対策）', () => {
    renderTopbar();
    const backLink = screen.getByLabelText('シート一覧へ戻る');
    const themeButton = screen.getByLabelText('テーマ切り替え');
    const firstViewToggle = screen.getByRole('button', { name: ALL_VIEW_KEYS.length > 0 ? 'スキルマトリクス' : '' });

    expect(backLink.compareDocumentPosition(themeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(themeButton.compareDocumentPosition(firstViewToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe('sm 以上（デスクトップ幅）', () => {
    const originalMatchMedia = global.matchMedia;

    beforeEach(() => {
      // useMediaQuery('(min-width: 640px)') が true を返すように、このブロックだけ
      // matchMedia をデスクトップ幅として上書きする（grow-textarea.test.tsx と同じ手法）。
      global.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 640px)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
      global.matchMedia = originalMatchMedia;
    });

    it('DOM順はビュートグルがアイコン群より前に戻る（CSS orderではなくDOM順自体を切り替える。レビュー指摘対応）', () => {
      renderTopbar();
      const firstViewToggle = screen.getByRole('button', { name: 'スキルマトリクス' });
      const themeButton = screen.getByLabelText('テーマ切り替え');
      expect(firstViewToggle.compareDocumentPosition(themeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
