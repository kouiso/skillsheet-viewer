import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Box, CircularProgress, Typography, Grid } from '@mui/material';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { fetchSheet, AuthError } from '@/lib/github-client';

interface Sheet {
  title: string;
  content: string;
}

const ComparePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pathA = searchParams.get('a') ?? '';
  const pathB = searchParams.get('b') ?? '';

  const [sheetA, setSheetA] = useState<Sheet | null>(null);
  const [sheetB, setSheetB] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pathA || !pathB) {
      void navigate('/view');
      return;
    }

    const load = async () => {
      try {
        const [dataA, dataB] = await Promise.all([fetchSheet(pathA), fetchSheet(pathB)]);
        const headingA = dataA.content.match(/^#\s+(.+)$/m);
        const headingB = dataB.content.match(/^#\s+(.+)$/m);
        setSheetA({
          title: headingA ? headingA[1].trim() : pathA.replace(/\.md$/, ''),
          content: dataA.content,
        });
        setSheetB({
          title: headingB ? headingB[1].trim() : pathB.replace(/\.md$/, ''),
          content: dataB.content,
        });
      } catch (err) {
        if (err instanceof AuthError) {
          void navigate('/viewer-auth');
          return;
        }
        setError('シートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [navigate, pathA, pathB]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h5">エラー</Typography>
        <Typography>{error}</Typography>
      </Box>
    );
  }

  if (!sheetA || !sheetB) return null;

  return (
    <Box>
      <Header title="スキルシート比較" />
      <Grid container spacing={0} sx={{ minHeight: 'calc(100vh - 64px)' }}>
        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{ borderRight: { md: '1px solid' }, borderColor: 'divider' }}
        >
          <SkillSheetViewer skillSheet={sheetA} compareMode />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SkillSheetViewer skillSheet={sheetB} compareMode />
        </Grid>
      </Grid>
    </Box>
  );
};

export default ComparePage;
