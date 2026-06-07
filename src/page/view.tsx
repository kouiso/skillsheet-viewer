import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Box, CircularProgress, Typography, Snackbar, Alert } from '@mui/material';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { fetchSheet, AuthError } from '@/lib/github-client';

interface SkillSheet {
  title: string;
  content: string;
}

const ViewPage = () => {
  const navigate = useNavigate();
  const { path } = useParams<{ path: string }>();
  const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (!path) {
      void navigate('/view');
      return;
    }

    const loadSkillSheet = async () => {
      try {
        setLoading(true);
        const data = await fetchSheet(path);
        const firstHeading = data.content.match(/^#\s+(.+)$/m);
        const title = firstHeading ? firstHeading[1].trim() : path.replace(/\.md$/, '');
        setSkillSheet({ title, content: data.content });
        setError(null);
      } catch (err) {
        if (err instanceof AuthError) {
          void navigate('/viewer-auth');
          return;
        }
        console.error('Error fetching skill sheet:', err);
        setError('スキルシートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void loadSkillSheet();
  }, [navigate, path]);

  const handleDownloadPdf = () => {
    if (!skillSheet) return;

    try {
      setPdfLoading(true);
      setSnackbarMessage('印刷ダイアログを開いています...');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      window.print();

      setSnackbarMessage('印刷ダイアログが開きました。PDFとして保存してください。');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Error opening print dialog:', err);
      setSnackbarMessage('印刷ダイアログを開けませんでした');
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
      <Header title={skillSheet.title} onDownloadPdf={handleDownloadPdf} pdfLoading={pdfLoading} />
      <SkillSheetViewer skillSheet={skillSheet} />

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
