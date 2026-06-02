import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, CircularProgress, Typography, Snackbar, Alert } from '@mui/material';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { fetchSkillSheet } from '@/lib/github-client';

interface SkillSheet {
  title: string;
  content: string;
}

// オブジェクト URL の解放を遅延させる時間（ms）
const REVOKE_OBJECT_URL_DELAY_MS = 100;

const ViewPage = () => {
  const navigate = useNavigate();
  const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  useEffect(() => {
    // Check authentication
    const isAuthenticated = sessionStorage.getItem('viewer-authenticated') === 'true';

    if (!isAuthenticated) {
      void navigate('/viewer-auth');
      return;
    }

    // Fetch skill sheet
    const loadSkillSheet = async () => {
      try {
        setLoading(true);
        const data = await fetchSkillSheet();
        setSkillSheet({
          title: 'エンジニアスキルシート',
          content: data.content,
        });
        setError(null);
      } catch (err) {
        console.error('Error fetching skill sheet:', err);
        setError('エンジニアスキルシートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void loadSkillSheet();
  }, [navigate]);

  const handleDownloadPdf = async () => {
    if (!skillSheet) return;

    try {
      setPdfLoading(true);

      // @react-pdf/renderer はサイズが大きいため、ボタン押下時に動的 import して初期バンドルから分離する
      const [{ pdf }, { SkillSheetPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/component/pdf-export'),
      ]);

      const blob = await pdf(<SkillSheetPDF title={skillSheet.title} content={skillSheet.content} />).toBlob();

      // 生成した PDF をワンクリックでダウンロード（印刷ダイアログは使わない）
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'エンジニアスキルシート.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // 一部ブラウザでは click 直後の同期 revoke でダウンロードが失敗するため少し遅延させる
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, REVOKE_OBJECT_URL_DELAY_MS);

      setSnackbarMessage('PDFをダウンロードしました');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setSnackbarMessage('PDFの生成に失敗しました');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Typography variant="h4">エラー</Typography>
        <Typography variant="body1">{error}</Typography>
      </Box>
    );
  }

  if (!skillSheet) {
    return null;
  }

  return (
    <Box>
      <Header onDownloadPdf={handleDownloadPdf} pdfLoading={pdfLoading} />
      <SkillSheetViewer skillSheet={skillSheet} />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ViewPage;
