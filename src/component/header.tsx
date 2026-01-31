import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Sun, Moon, LogOut, FileDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';

interface HeaderProps {
  title?: string;
  onDownloadPdf?: () => void;
  pdfLoading?: boolean;
}

const Header = ({ title = 'エンジニアスキルシート', onDownloadPdf, pdfLoading = false }: HeaderProps) => {
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem('viewer-authenticated');
    void navigate('/viewer-auth');
  };

  return (
    <TooltipProvider>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="sticky top-0 z-50 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 border-b border-border shadow-sm"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-1">
            {onDownloadPdf && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onDownloadPdf}
                    disabled={pdfLoading}
                    className="transition-all duration-300 hover:scale-110 active:scale-95"
                    aria-label="PDFダウンロード"
                  >
                    <FileDown className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>PDFダウンロード</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="transition-all duration-300 hover:scale-110 active:scale-95"
                  aria-label="テーマ切り替え"
                >
                  {mode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>テーマ切り替え</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="transition-all duration-300 hover:scale-110 active:scale-95"
                  aria-label="ログアウト"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>ログアウト</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </motion.header>
    </TooltipProvider>
  );
};

export default Header;
