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
});
