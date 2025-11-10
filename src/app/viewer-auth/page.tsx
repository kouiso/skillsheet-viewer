'use client';

import { useState } from 'react';

import { Box, Button, Card, CardContent, TextField, Typography, Alert } from '@mui/material';
import { useRouter } from 'next/navigation';

import { trpc } from '@/utils/trpc';

export default function ViewerAuthPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const verifyMutation = trpc.viewerAuth.verify.useMutation({
    onSuccess: async () => {
      // Set session cookie via API route
      await fetch('/api/viewer-auth/session', { method: 'POST' });
      router.push('/view');
      router.refresh();
    },
    onError: (error) => {
      setError(error.message || '認証コードが正しくありません');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    verifyMutation.mutate({ code });
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
            認証コード入力
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
              disabled={verifyMutation.isPending}
              sx={{ mt: 3, py: 1.5 }}
            >
              {verifyMutation.isPending ? '認証中...' : '認証'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
