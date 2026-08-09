import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeModeProvider } from '@/context/theme-context';

import DbSheetsListClient from './db-sheets-list-client';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

// framer-motion をモック（Header が motion.header を使うため）。header.test.tsx と同じ方針。
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

const sheets = [{ id: 's1', title: 'テストシート', updatedAt: new Date('2026-01-01T00:00:00.000Z') }];

const renderClient = (props: Partial<Parameters<typeof DbSheetsListClient>[0]> = {}) =>
  render(
    <ThemeModeProvider>
      <TooltipProvider delayDuration={0}>
        <DbSheetsListClient initialSheets={sheets} {...props} />
      </TooltipProvider>
    </ThemeModeProvider>,
  );

describe('DbSheetsListClient', () => {
  it('stale=false のときは鮮度バナーを出さない', () => {
    renderClient({ stale: false });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('テストシート')).toBeInTheDocument();
  });

  // Issue #204 の一覧版（chatgpt-codex-connector レビュー指摘）: DB への再検証に失敗しても
  // /view の一覧は sheet.list 経由で古いキャッシュを無期限に返し続け、画面からは分からなかった。
  // /view/db・/view/db/[id] と同じ鮮度バナーを一覧にも出す。
  it('stale=true のときは sheet-view-client.tsx と同じ鮮度バナーを表示する', () => {
    renderClient({ stale: true });
    expect(screen.getByRole('status')).toHaveTextContent(
      '表示中の内容はしばらく更新されていない可能性があります。最新の状態と異なる場合があります。',
    );
    // バナーが出ても一覧の内容自体は表示され続ける。
    expect(screen.getByText('テストシート')).toBeInTheDocument();
  });
});
