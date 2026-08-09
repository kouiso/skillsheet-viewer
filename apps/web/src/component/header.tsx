'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, FileDown, FileText, Moon, PencilLine, Sun } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';

interface HeaderProps {
  title?: string;
  onDownloadPdf?: () => void | Promise<void>;
  pdfLoading?: boolean;
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
  canEdit = true,
  reserveEditSlot = false,
  backHref,
}: HeaderProps) => {
  const { mode, toggleTheme } = useThemeMode();
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
      className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md"
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
                  size="icon"
                  onClick={() => void onDownloadPdf()}
                  disabled={pdfLoading}
                  aria-label="PDFダウンロード"
                  className="min-h-11 min-w-11"
                >
                  <FileDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>PDFをダウンロード</TooltipContent>
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
