import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/db/blocks';

import SheetViewClient from './sheet-view-client';

const toastLoading = vi.hoisted(() => vi.fn(() => 'toast-1'));
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toBlob = vi.hoisted(() => vi.fn(async () => new Blob(['pdf'], { type: 'application/pdf' })));

vi.mock('sonner', () => ({
  toast: { loading: toastLoading, success: toastSuccess, error: toastError },
}));

// @react-pdf/renderer は jsdom で動かない上に読み込みが重いので、
// handleDownloadPdf の分岐（成功/失敗）だけを制御できるモックに置き換える。
vi.mock('@react-pdf/renderer', () => ({ pdf: () => ({ toBlob }) }));
vi.mock('@/components/pdf-export', () => ({ SkillSheetPDF: () => null }));

// 本体（ビューア）の描画は本テストの対象外。トップバーは
// 「どちらが出たか」と「押したら onDownloadPdf が走るか」だけ見えれば十分。
vi.mock('@/components/skill-sheet-viewer', () => ({ default: () => <div data-testid="viewer" /> }));
vi.mock('@/components/header', () => ({
  default: ({ onDownloadPdf, pdfLoading }: { onDownloadPdf?: () => void; pdfLoading?: boolean }) => (
    <button type="button" data-testid="legacy-header-pdf" data-loading={String(pdfLoading)} onClick={onDownloadPdf}>
      PDF
    </button>
  ),
}));
vi.mock('@/components/viewer-topbar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/viewer-topbar')>();
  return {
    ...actual,
    ViewerTopbar: ({ onDownloadPdf, pdfLoading }: { onDownloadPdf?: () => void; pdfLoading?: boolean }) => (
      <button
        type="button"
        data-testid="dashboard-topbar-pdf"
        data-loading={String(pdfLoading)}
        onClick={onDownloadPdf}
      >
        PDF
      </button>
    ),
  };
});

const projectBlock: Block = { id: 'p1', type: 'project', order: 0, data: { companies: [], items: [] } };
const markdownBlock: Block = { id: 'm1', type: 'markdown', order: 0, data: { markdown: '# 目印' } };

const renderClient = (props: Partial<React.ComponentProps<typeof SheetViewClient>> = {}) =>
  render(<SheetViewClient title="テストシート" content="# 見出し" {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
  toBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
  // jsdom には未実装のため、ダウンロードリンク生成に必要な API を差し替える。
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SheetViewClient', () => {
  describe('PDF ダウンロードのフィードバック（#191）', () => {
    it('生成中は loading トーストを出し、成功時に同じ id を success で置き換える', async () => {
      const user = userEvent.setup();
      renderClient({ blocks: [projectBlock] });

      await user.click(screen.getByTestId('dashboard-topbar-pdf'));

      await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
      expect(toastLoading).toHaveBeenCalledWith('PDFを生成中…');
      // id を渡さないとトーストが積み上がって「生成中…」が残り続ける。
      expect(toastSuccess).toHaveBeenCalledWith('PDFをダウンロードしました', { id: 'toast-1' });
      expect(toastError).not.toHaveBeenCalled();
    });

    it('生成に失敗したときは同じ id を error で置き換え、loading を残さない', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      toBlob.mockRejectedValueOnce(new Error('boom'));
      const user = userEvent.setup();
      renderClient({ blocks: [projectBlock] });

      await user.click(screen.getByTestId('dashboard-topbar-pdf'));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(toastError).toHaveBeenCalledWith('PDFの生成に失敗しました', { id: 'toast-1' });
      expect(toastSuccess).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('失敗しても pdfLoading が false に戻り、ボタンが押せなくならない（finally 節の回帰防止）', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      toBlob.mockRejectedValueOnce(new Error('boom'));
      const user = userEvent.setup();
      renderClient({ blocks: [projectBlock] });

      const button = screen.getByTestId('dashboard-topbar-pdf');
      await user.click(button);

      await waitFor(() => expect(button).toHaveAttribute('data-loading', 'false'));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('トップバーの出し分け', () => {
    it('project ブロックを含むシートはダッシュボードのトップバーを出す', () => {
      renderClient({ blocks: [projectBlock] });
      expect(screen.getByTestId('dashboard-topbar-pdf')).toBeInTheDocument();
      expect(screen.queryByTestId('legacy-header-pdf')).not.toBeInTheDocument();
    });

    it('project ブロックが無いシートはレガシーヘッダーを出し、そちらからも PDF を生成できる', async () => {
      const user = userEvent.setup();
      renderClient({ blocks: [markdownBlock] });

      expect(screen.queryByTestId('dashboard-topbar-pdf')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('legacy-header-pdf'));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('PDFをダウンロードしました', { id: 'toast-1' }));
    });

    it('blocks 自体が無いシートもレガシーヘッダーを出す（blocks ?? [] の回帰防止）', () => {
      renderClient();
      expect(screen.getByTestId('legacy-header-pdf')).toBeInTheDocument();
    });
  });
});
