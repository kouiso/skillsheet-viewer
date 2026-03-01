import { useNavigate } from 'react-router-dom';

import { AppBar, Toolbar, Typography, IconButton, Box } from '@mui/material';
import { Brightness4, Brightness7, Logout, Description, PictureAsPdf } from '@mui/icons-material';
import { motion } from 'framer-motion';

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
    sessionStorage.removeItem('viewer-authenticated');
    void navigate('/viewer-auth');
  };

  return (
    <AppBar
      position="sticky"
      elevation={1}
      component={motion.div}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      sx={{
        backdropFilter: 'blur(10px)',
        backgroundColor: mode === 'dark' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        color: (theme) => theme.palette.text.primary,
        '@media print': {
          display: 'none !important',
        },
      }}
    >
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          <Description sx={{ fontSize: 28 }} color="primary" />
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontWeight: 700,
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {title}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {onDownloadPdf && (
            <IconButton
              onClick={() => {
                void onDownloadPdf();
              }}
              color="inherit"
              component={motion.button}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label="PDFダウンロード"
              disabled={pdfLoading}
              sx={{
                transition: 'all 0.3s ease',
                '&:hover': {
                  backgroundColor: (theme) => theme.palette.action.hover,
                },
              }}
            >
              <PictureAsPdf />
            </IconButton>
          )}

          <IconButton
            onClick={toggleTheme}
            color="inherit"
            component={motion.button}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="テーマ切り替え"
            sx={{
              transition: 'all 0.3s ease',
              '&:hover': {
                backgroundColor: (theme) => theme.palette.action.hover,
              },
            }}
          >
            {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
          </IconButton>

          <IconButton
            onClick={handleLogout}
            color="inherit"
            component={motion.button}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="ログアウト"
            sx={{
              transition: 'all 0.3s ease',
              '&:hover': {
                backgroundColor: (theme) => theme.palette.action.hover,
              },
            }}
          >
            <Logout />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
