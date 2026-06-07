import { useNavigate } from 'react-router-dom';

import { motion } from 'framer-motion';
import { FileText, FileDown, LogOut, Moon, Sun } from 'lucide-react';

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
  const navigate = useNavigate();

  const handleLogout = () => {
    void fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      void navigate('/viewer-auth');
    });
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <FileText className="size-7 text-primary" />
          <span className="bg-linear-to-br from-primary to-secondary bg-clip-text text-lg font-bold text-transparent">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1">
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="ログアウト">
                <LogOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent>ログアウト</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;
