import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/db/block';

import SheetViewClient from './sheet-view-client';

const toastLoading = vi.hoisted(() => vi.fn(() => 'toast-1'));
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toBlob = vi.hoisted(() => vi.fn(async () => new Blob(['pdf'], { type: 'application/pdf' })));
const createSkillSheetPdf = vi.hoisted(() => vi.fn(async () => null));
const trackEvent = vi.hoisted(() => vi.fn());
// フォント取得の失敗が永久化しないよう、失敗のたびに Font.clear() で登録をリセットする
// （src/component/pdf/font.ts の resetPdfFontsAfterFailure）。handleDownloadPdf の catch が
// 動的 import する src/component/pdf/font.ts も内部で `import { Font } from '@react-pdf/renderer'`
// しているため、このモックに Font を足さないと「モックに無い export」でテストが落ちる。
// 後始末は「アプリが登録した family だけを消す」形。標準フォントを巻き込むと
// 2 回目の生成が Helvetica 未登録で落ちるため（font-reset.node.test.tsx 参照）。
const fontFamilies = vi.hoisted(() => ({ Helvetica: {}, 'Noto Sans JP': {} }) as Record<string, unknown>);

vi.mock('sonner', () => ({
  toast: { loading: toastLoading, success: toastSuccess, error: toastError },
}));

// @react-pdf/renderer は jsdom で動かない上に読み込みが重いので、
// handleDownloadPdf の分岐（成功/失敗）だけを制御できるモックに置き換える。
vi.mock('@react-pdf/renderer', () => ({ pdf: () => ({ toBlob }), Font: { fontFamilies, register: vi.fn() } }));
vi.mock('@/component/pdf-export', () => ({
  createSkillSheetPdf,
  // 後始末は pdf-export から同じ import で受け取る（catch 内で再度 await しないため）。
  resetPdfFontsAfterFailure: () => {
    delete fontFamilies['Noto Sans JP'];
  },
}));

// テレメトリは未登録だと no-op なので、ここでは track の呼ばれ方だけを掴む。
vi.mock('@/lib/observability/capture', () => ({
  track: trackEvent,
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

// 本体（ビューア）の描画は本テストの対象外。トップバーは
// 「どちらが出たか」と「押したら onDownloadPdf が走るか」だけ見えれば十分。
vi.mock('@/component/skill-sheet-viewer', () => ({ default: () => <div data-testid="viewer" /> }));
vi.mock('@/component/header', () => ({
  default: ({ onDownloadPdf, pdfLoading }: { onDownloadPdf?: () => void; pdfLoading?: boolean }) => (
    <button type="button" data-testid="legacy-header-pdf" data-loading={String(pdfLoading)} onClick={onDownloadPdf}>
      PDF
    </button>
  ),
}));
vi.mock('@/component/viewer-topbar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/component/viewer-topbar')>();
  return {
    ...actual,
    ViewerTopbar: ({
      onDownloadPdf,
      pdfLoading,
      onDownloadExcel,
      onDownloadPdfDigest,
      onDownloadExcelDigest,
      digestLoading,
    }: {
      onDownloadPdf?: () => void;
      pdfLoading?: boolean;
      onDownloadExcel?: () => void;
      onDownloadPdfDigest?: () => void;
      onDownloadExcelDigest?: () => void;
      digestLoading?: boolean;
    }) => (
      <>
        <button
          type="button"
          data-testid="dashboard-topbar-pdf"
          data-loading={String(pdfLoading)}
          onClick={onDownloadPdf}
        >
          PDF
        </button>
        {onDownloadExcel && (
          <button type="button" data-testid="dashboard-topbar-excel" onClick={onDownloadExcel}>
            Excel
          </button>
        )}
        {onDownloadPdfDigest && (
          <button
            type="button"
            data-testid="dashboard-topbar-pdf-digest"
            data-loading={String(digestLoading)}
            onClick={onDownloadPdfDigest}
          >
            PDF（要約版）
          </button>
        )}
        {onDownloadExcelDigest && (
          <button type="button" data-testid="dashboard-topbar-excel-digest" onClick={onDownloadExcelDigest}>
            Excel（要約版）
          </button>
        )}
      </>
    ),
  };
});

const projectBlock: Block = { id: 'p1', type: 'project', order: 0, data: { companies: [], items: [] } };
const markdownBlock: Block = { id: 'm1', type: 'markdown', order: 0, data: { markdown: '# 目印' } };

const renderClient = (props: Partial<React.ComponentProps<typeof SheetViewClient>> = {}) =>
  render(<SheetViewClient title="テストシート" content="# 見出し" source="db" {...props} />);

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
      // 失敗のたびにアプリの family だけ登録を捨てる（次のクリックで新しい FontSource から
      // 取得し直させ、@react-pdf/font の reject 済み loadResultPromise がキャッシュされ続けて
      // 以後ずっと同じ失敗を再現する「詰み」状態を防ぐ）。標準フォントは残す。
      await waitFor(() => expect(Object.keys(fontFamilies)).not.toContain('Noto Sans JP'));
      expect(Object.keys(fontFamilies)).toContain('Helvetica');
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

  describe('要約版ダウンロード（#326）', () => {
    // a.click() は jsdom では「ページ遷移しようとした」警告しか出ないので、
    // click 前に link.download を掴むため HTMLElement ではなく anchor の click をフックする。
    const captureDownloads = () => {
      const names: string[] = [];
      const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
      return { names, spy };
    };

    it('要約版 PDF は edition=digest で生成し「（要約版）.pdf」付きファイル名で落とす', async () => {
      const downloads = captureDownloads();
      const user = userEvent.setup();
      renderClient({ title: 'テストシート', blocks: [projectBlock] });

      await user.click(screen.getByTestId('dashboard-topbar-pdf-digest'));

      await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
      expect(createSkillSheetPdf).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'テストシート', edition: 'digest' }),
      );
      expect(toastLoading).toHaveBeenCalledWith('要約版PDFを生成中…');
      expect(toastSuccess).toHaveBeenCalledWith('要約版PDFをダウンロードしました', { id: 'toast-1' });
      expect(downloads.names.at(-1)).toBe('テストシート（要約版）.pdf');
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'pdf_exported', edition: 'digest', result: 'success' }),
      );
      downloads.spy.mockRestore();
    });

    it('要約版の失敗でも digestLoading が false に戻り、失敗イベントに edition=digest が乗る', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      createSkillSheetPdf.mockRejectedValueOnce(new Error('boom'));
      const user = userEvent.setup();
      renderClient({ blocks: [projectBlock] });

      const button = screen.getByTestId('dashboard-topbar-pdf-digest');
      await user.click(button);

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('要約版PDFの生成に失敗しました', { id: 'toast-1' }));
      await waitFor(() => expect(button).toHaveAttribute('data-loading', 'false'));
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'pdf_exported', edition: 'digest', result: 'failure' }),
      );
      consoleErrorSpy.mockRestore();
    });

    it('要約版 Excel は ?edition=digest 付きで API を呼び、「（要約版）.xlsx」名で落とす', async () => {
      const downloads = captureDownloads();
      const fetchMock = vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['xlsx'], { type: 'application/octet-stream' }),
      }));
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      const id = '11111111-1111-4111-8111-111111111111';
      renderClient({ title: 'テストシート', blocks: [projectBlock], sheetId: id });

      await user.click(screen.getByTestId('dashboard-topbar-excel-digest'));

      await waitFor(() =>
        expect(toastSuccess).toHaveBeenCalledWith('要約版Excelをダウンロードしました', { id: 'toast-1' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(`/api/sheet/export-xlsx?id=${encodeURIComponent(id)}&edition=digest`);
      expect(downloads.names.at(-1)).toBe('テストシート（要約版）.xlsx');
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'excel_exported', edition: 'digest', result: 'success' }),
      );
      downloads.spy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('全文版 PDF / Excel のイベントには edition=full が乗る', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['xlsx'], { type: 'application/octet-stream' }),
      }));
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderClient({ blocks: [projectBlock] });

      await user.click(screen.getByTestId('dashboard-topbar-pdf'));
      await waitFor(() =>
        expect(trackEvent).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'pdf_exported', edition: 'full', result: 'success' }),
        ),
      );

      await user.click(screen.getByTestId('dashboard-topbar-excel'));
      await waitFor(() =>
        expect(trackEvent).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'excel_exported', edition: 'full', result: 'success' }),
        ),
      );
      // 全文版のクエリに edition は付けない（既存呼び出しと同じ URL）。
      expect(fetchMock).toHaveBeenCalledWith('/api/sheet/export-xlsx');
      vi.unstubAllGlobals();
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

    it('Markdown シートでは要約版ボタンが描かれない（要約版は案件ブロック必須、#326）', () => {
      renderClient({ blocks: [markdownBlock] });
      expect(screen.queryByTestId('dashboard-topbar-pdf-digest')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-topbar-excel-digest')).not.toBeInTheDocument();
      expect(screen.getByTestId('legacy-header-pdf')).toBeInTheDocument();
    });

    it('blocks 自体が無いシートもレガシーヘッダーを出す（blocks ?? [] の回帰防止）', () => {
      renderClient();
      expect(screen.getByTestId('legacy-header-pdf')).toBeInTheDocument();
    });
  });
});
