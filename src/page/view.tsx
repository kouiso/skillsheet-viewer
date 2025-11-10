import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, CircularProgress, Typography } from '@mui/material';

import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { fetchSkillSheet } from '@/lib/github-client';

interface SkillSheet {
  title: string;
  content: string;
}

const ViewPage = () => {
  const navigate = useNavigate();
  const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return <SkillSheetViewer skillSheet={skillSheet} />;
};

export default ViewPage;
