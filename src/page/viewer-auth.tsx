import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, Button, Card, CardContent, TextField, Typography, Alert } from '@mui/material';

const ViewerAuthPage = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    try {
      // Client-side authentication using environment variable
      const validCode = import.meta.env.VITE_VIEWER_CODE;

      if (!validCode) {
        setError('認証システムの設定が不正です');
        setIsVerifying(false);
        return;
      }

      if (code === validCode) {
        // Store authentication status in sessionStorage
        sessionStorage.setItem('viewer-authenticated', 'true');
        void navigate('/view');
      } else {
        setError('認証コードが正しくありません');
        setIsVerifying(false);
      }
    } catch {
      setError('認証に失敗しました。もう一度お試しください。');
      setIsVerifying(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
      }}
    >
      <Card sx={{ minWidth: 400, maxWidth: 500 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            エンジニアスキルシート閲覧
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
            共有された認証コードを入力してください
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
          >
            <TextField
              fullWidth
              label="認証コード"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              margin="normal"
              required
              autoComplete="off"
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={isVerifying}
              sx={{ mt: 3, py: 1.5 }}
            >
              {isVerifying ? '認証中...' : '認証'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ViewerAuthPage;
