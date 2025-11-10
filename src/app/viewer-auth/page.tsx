'use client';

import { useState } from 'react';

import { Box, Button, Card, CardContent, TextField, Typography, Alert } from '@mui/material';
import { useRouter } from 'next/navigation';

export default function ViewerAuthPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    try {
      const response = await fetch('/api/viewer-auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || '認証コードが正しくありません');
        setIsVerifying(false);
        return;
      }

      // Success - redirect to view page
      router.push('/view');
      router.refresh();
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
}
