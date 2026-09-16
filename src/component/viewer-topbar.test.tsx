import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/component/ui/tooltip';
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
 * ただしダウンロード系は SP では「ダウンロード」メニュー1個に畳まれる（320px 幅で
 * 戻るリンクのタップターゲットを確保するため）ため、個別ラベルはデスクトップ側だけに出る。
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
    const slots = screen.getAllByTestId('edit-slot');
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot).toHaveClass('size-11', 'shrink-0');
    }
    expect(screen.queryByLabelText('編集／ビルダー')).not.toBeInTheDocument();
    unmount();

    renderTopbar({ canEdit: true, reserveEditSlot: true });
    const slots2 = screen.getAllByTestId('edit-slot');
    expect(slots2).toHaveLength(2);
    for (const slot of slots2) {
      expect(slot).toHaveClass('size-11', 'shrink-0');
    }
    expect(screen.getAllByLabelText('編集／ビルダー')).toHaveLength(2);
  });

  describe('「稼働月数」トグル（#288）', () => {
    it('ビュートグル列に「稼働月数」を出し、押すと onToggleView("duration") が呼ばれる', async () => {
      const user = userEvent.setup();
      const onToggleView = vi.fn();
      renderTopbar({ onToggleView });

      const pill = screen.getByRole('button', { name: '稼働月数' });
      // views が全 ON なら押下状態。
      expect(pill).toHaveAttribute('aria-pressed', 'true');
      await user.click(pill);
      expect(onToggleView).toHaveBeenCalledWith('duration');
    });

    it('views から「duration」を外すとトグルが OFF 表示になる', () => {
      renderTopbar({ views: ['skills', 'process', 'projects', 'timeline'] });
      expect(screen.getByRole('button', { name: '稼働月数' })).toHaveAttribute('aria-pressed', 'false');
    });
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
    it('通常時は「PDFダウンロード」ラベルで押せる（デスクトップ側）', () => {
      renderTopbar({ onDownloadPdf: vi.fn() });
      const buttons = getIconCopies('PDFダウンロード');
      expect(buttons).toHaveLength(1);
      for (const button of buttons) {
        expect(button).toBeEnabled();
        expect(button).toHaveAttribute('aria-busy', 'false');
      }
      // SP 側は「ダウンロード」メニューに畳まれている。
      expect(getIconCopies('ダウンロード')).toHaveLength(1);
    });

    it('pdfLoading 中は無効化され、aria-busy と生成中ラベルで状態を伝える', () => {
      renderTopbar({ onDownloadPdf: vi.fn(), pdfLoading: true });
      const desktop = getIconCopies('PDFを生成中');
      expect(desktop).toHaveLength(1);
      const sp = getIconCopies('ダウンロードを生成中');
      expect(sp).toHaveLength(1);
      for (const button of [...desktop, ...sp]) {
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

  describe('Excel ダウンロードの生成中フィードバック', () => {
    it('通常時は「Excelダウンロード」ラベルで押せる（デスクトップ側）', () => {
      renderTopbar({ onDownloadExcel: vi.fn() });
      const buttons = getIconCopies('Excelダウンロード');
      expect(buttons).toHaveLength(1);
      for (const button of buttons) {
        expect(button).toBeEnabled();
        expect(button).toHaveAttribute('aria-busy', 'false');
      }
      expect(getIconCopies('ダウンロード')).toHaveLength(1);
    });

    it('excelLoading 中は無効化され、aria-busy と生成中ラベルで状態を伝える', () => {
      renderTopbar({ onDownloadExcel: vi.fn(), excelLoading: true });
      const desktop = getIconCopies('Excelを生成中');
      expect(desktop).toHaveLength(1);
      const sp = getIconCopies('ダウンロードを生成中');
      expect(sp).toHaveLength(1);
      for (const button of [...desktop, ...sp]) {
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
      }
      expect(screen.queryByLabelText('Excelダウンロード')).not.toBeInTheDocument();
    });

    it('onDownloadExcel 未指定なら Excel ボタン自体を出さない', () => {
      renderTopbar();
      expect(screen.queryByLabelText('Excelダウンロード')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Excelを生成中')).not.toBeInTheDocument();
    });
  });

  describe('要約版ダウンロード（Popover で PDF / Excel を選ぶ、#326）', () => {
    it('onDownloadPdfDigest 指定でアイコンが出る（デスクトップは専用、SP はダウンロードメニュー内）', () => {
      renderTopbar({ onDownloadPdfDigest: vi.fn() });
      const buttons = getIconCopies('要約版をダウンロード');
      expect(buttons).toHaveLength(1);
      for (const button of buttons) {
        expect(button).toBeEnabled();
        expect(button).toHaveAttribute('aria-busy', 'false');
      }
      expect(getIconCopies('ダウンロード')).toHaveLength(1);
    });

    it('onDownloadPdfDigest 未指定なら要約版ボタン自体を出さない', () => {
      renderTopbar();
      expect(screen.queryByLabelText('要約版をダウンロード')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('要約版を生成中')).not.toBeInTheDocument();
    });

    it('Popover を開くと PDF と Excel（要約版）の選択肢が出て、押すと閉じてからコールバックされる', async () => {
      const user = userEvent.setup();
      const onPdf = vi.fn();
      const onExcel = vi.fn();
      renderTopbar({ onDownloadPdfDigest: onPdf, onDownloadExcelDigest: onExcel });

      // デスクトップ側のトリガーを開く。
      await user.click(getIconCopies('要約版をダウンロード')[0]);
      const pdfItem = await screen.findByRole('button', { name: 'PDF（要約版）ダウンロード' });
      const excelItem = screen.getByRole('button', { name: 'Excel（要約版）ダウンロード' });

      await user.click(pdfItem);
      expect(onPdf).toHaveBeenCalledTimes(1);
      expect(onExcel).not.toHaveBeenCalled();
      // クリック後に Popover は閉じる（選択肢が DOM から外れる）。
      expect(screen.queryByRole('button', { name: 'Excel（要約版）ダウンロード' })).not.toBeInTheDocument();

      await user.click(getIconCopies('要約版をダウンロード')[0]);
      await user.click(await screen.findByRole('button', { name: 'Excel（要約版）ダウンロード' }));
      expect(onExcel).toHaveBeenCalledTimes(1);
      expect(onPdf).toHaveBeenCalledTimes(1);
      expect(excelItem).toBeDefined();
    });

    it('onDownloadExcelDigest 未指定なら Popover 内に Excel の選択肢が出ない', async () => {
      const user = userEvent.setup();
      renderTopbar({ onDownloadPdfDigest: vi.fn() });

      await user.click(getIconCopies('要約版をダウンロード')[0]);
      expect(await screen.findByRole('button', { name: 'PDF（要約版）ダウンロード' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Excel（要約版）ダウンロード' })).not.toBeInTheDocument();
    });

    it('digestLoading 中はトリガーが無効化され、aria-busy と生成中ラベルで状態を伝える', () => {
      renderTopbar({ onDownloadPdfDigest: vi.fn(), digestLoading: true });
      const desktop = getIconCopies('要約版を生成中');
      expect(desktop).toHaveLength(1);
      const sp = getIconCopies('ダウンロードを生成中');
      expect(sp).toHaveLength(1);
      for (const button of [...desktop, ...sp]) {
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
      }
      expect(screen.queryByLabelText('要約版をダウンロード')).not.toBeInTheDocument();
    });
  });

  describe('SP 用ダウンロードメニュー（320px 幅でも戻るリンクのタップターゲットを確保）', () => {
    it('開くと PDF / Excel / 要約版の選択肢が出て、押すと閉じてからコールバックされる', async () => {
      const user = userEvent.setup();
      const onPdf = vi.fn();
      const onExcel = vi.fn();
      const onPdfDigest = vi.fn();
      const onExcelDigest = vi.fn();
      renderTopbar({
        onDownloadPdf: onPdf,
        onDownloadExcel: onExcel,
        onDownloadPdfDigest: onPdfDigest,
        onDownloadExcelDigest: onExcelDigest,
      });

      await user.click(getIconCopies('ダウンロード')[0]);
      // メニュー項目はデスクトップ側の同名ボタンと区別するためポップオーバー内を探す。
      const inPopover = (el: HTMLElement) => el.closest('[data-radix-popper-content-wrapper]') !== null;
      const findPopoverItem = async (name: string) => (await screen.findAllByRole('button', { name })).find(inPopover);
      const queryPopoverItem = (name: string) => screen.queryAllByRole('button', { name }).find(inPopover);
      expect(await findPopoverItem('PDFダウンロード')).toBeDefined();
      expect(await findPopoverItem('Excelダウンロード')).toBeDefined();
      expect(await findPopoverItem('PDF（要約版）ダウンロード')).toBeDefined();
      const excelDigest = await findPopoverItem('Excel（要約版）ダウンロード');

      await user.click(excelDigest as HTMLElement);
      expect(onExcelDigest).toHaveBeenCalledTimes(1);
      // クリック後に Popover は閉じて項目が DOM から外れる（デスクトップ側の常設ボタンは残る）。
      expect(queryPopoverItem('Excel（要約版）ダウンロード')).toBeUndefined();
    });

    it('ダウンロード系ハンドラが無ければメニューを出さない', () => {
      renderTopbar();
      expect(screen.queryByLabelText('ダウンロード')).not.toBeInTheDocument();
    });
  });
});
