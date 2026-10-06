'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, FileDown, FileText, Loader2, Moon, PencilLine, Sheet, Sun } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/component/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/component/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';
import { useViewerTopbarHeight } from '@/hook/use-viewer-topbar-height';

interface HeaderProps {
  title?: string;
  onDownloadPdf?: () => void | Promise<void>;
  pdfLoading?: boolean;
  /** Excel ダウンロード（DB シートのみ。未指定ならボタンを出さない）。 */
  onDownloadExcel?: () => void | Promise<void>;
  excelLoading?: boolean;
  /** 編集者ログイン済みか。false のときは編集導線（ビルダーリンク）を出さない。 */
  canEdit?: boolean;
  /** 編集者判定の前後で編集ボタン分の幅を固定する。 */
  reserveEditSlot?: boolean;
  /** 指定時、タイトル左に一覧などへ戻るリンクを出す（例: "/view"）。 */
  backHref?: string;
}

const Header = ({
  title = 'エンジニアスキルシート',
  onDownloadPdf,
  pdfLoading = false,
  onDownloadExcel,
  excelLoading = false,
  canEdit = true,
  reserveEditSlot = false,
  backHref,
}: HeaderProps) => {
  const { mode, toggleTheme } = useThemeMode();
  // レガシーヘッダーも実高を --viewer-topbar-h へ流す（#397）。project ブロック無しの
  // シートでも目次サイドバーがこの変数を引くため、ViewerTopbar と揃えておかないと
  // フォールバック値と実高の差ぶん目次がずれる。
  const headerRef = useViewerTopbarHeight<HTMLElement>();
  const editButton = canEdit ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" asChild aria-label="編集／ビルダー" className="min-h-11 min-w-11">
          <Link href="/builder">
            <PencilLine />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>編集／ビルダー</TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="no-print sticky top-0 z-40 border-b border-border bg-card"
      ref={headerRef}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {backHref ? (
          <Link
            href={backHref}
            className="flex min-h-11 items-center gap-2 rounded-md -mx-2 px-2 transition-colors hover:bg-accent"
            aria-label="シート一覧へ戻る"
          >
            <ArrowLeft className="size-4 text-muted-foreground" aria-hidden="true" />
            <FileText className="size-5 text-primary" />
            <span className="font-mono text-sm font-semibold tracking-wider text-foreground">{title}</span>
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            <span className="font-mono text-sm font-semibold tracking-wider text-foreground">{title}</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          {reserveEditSlot ? (
            <span data-testid="edit-slot" className="size-11 shrink-0">
              {editButton}
            </span>
          ) : (
            editButton
          )}

          {onDownloadPdf && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={() => void onDownloadPdf()}
                  disabled={pdfLoading}
                  aria-busy={pdfLoading}
                  aria-label={pdfLoading ? 'PDFを生成中' : 'PDFダウンロード'}
                  className="min-h-11 min-w-11 gap-1.5 px-2.5 text-[13px]"
                >
                  {pdfLoading ? <Loader2 className="animate-spin" /> : <FileDown />}
                  <span className="hidden xl:inline">PDF</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>PDFをダウンロード</TooltipContent>
            </Tooltip>
          )}

          {onDownloadExcel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={() => void onDownloadExcel()}
                  disabled={excelLoading}
                  aria-busy={excelLoading}
                  aria-label={excelLoading ? 'Excelを生成中' : 'Excelダウンロード'}
                  className="min-h-11 min-w-11 gap-1.5 px-2.5 text-[13px]"
                >
                  {excelLoading ? <Loader2 className="motion-safe:animate-spin" /> : <Sheet />}
                  <span className="hidden xl:inline">Excel</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Excelをダウンロード</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label="テーマ切り替え"
                className="min-h-11 min-w-11"
              >
                {mode === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{mode === 'dark' ? 'ライトモード' : 'ダークモード'}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;
