'use client';

import { motion } from 'framer-motion';
import { FileDown, FileText, Moon, PencilLine, Sun } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';

interface HeaderProps {
  title?: string;
  onDownloadPdf?: () => void | Promise<void>;
  pdfLoading?: boolean;
}

const Header = ({ title = 'エンジニアスキルシート', onDownloadPdf, pdfLoading = false }: HeaderProps) => {
  const { mode, toggleTheme } = useThemeMode();

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <span className="font-mono text-sm font-semibold tracking-wider text-foreground">{title}</span>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild aria-label="編集／ビルダー">
                <Link href="/builder">
                  <PencilLine />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>編集／ビルダー</TooltipContent>
          </Tooltip>

          {onDownloadPdf && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void onDownloadPdf()}
                  disabled={pdfLoading}
                  aria-label="PDFダウンロード"
                >
                  <FileDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>PDFをダウンロード</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="テーマ切り替え">
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
