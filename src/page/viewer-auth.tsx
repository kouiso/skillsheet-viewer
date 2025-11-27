import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, Button, Card, CardContent, TextField, Typography, Alert, useTheme } from '@mui/material';
import { LockOpen } from '@mui/icons-material';
import { motion } from 'framer-motion';

const ViewerAuthPage = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const theme = useTheme();

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
        background:
          theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 背景装飾 */}
      <Box
        component={motion.div}
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 20,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'linear',
        }}
        sx={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background:
            theme.palette.mode === 'dark'
              ? 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
          top: '-10%',
          right: '-10%',
        }}
      />

      <Card
        component={motion.div}
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.6,
          ease: [0.43, 0.13, 0.23, 0.96],
        }}
        sx={{
          minWidth: { xs: '90%', sm: 400 },
          maxWidth: 500,
          backdropFilter: 'blur(10px)',
          backgroundColor:
            theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.95)',
          boxShadow: theme.shadows[10],
          position: 'relative',
          zIndex: 1,
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* アイコン */}
          <Box
            component={motion.div}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mb: 2,
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme.shadows[4],
              }}
            >
              <LockOpen sx={{ fontSize: 40, color: 'white' }} />
            </Box>
          </Box>

          <Typography
            component={motion.h1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            variant="h4"
            gutterBottom
            align="center"
            sx={{ fontWeight: 700 }}
          >
            エンジニアスキルシート閲覧
          </Typography>

          <Typography
            component={motion.p}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ mb: 4 }}
          >
            共有された認証コードを入力してください
          </Typography>

          {error && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            </motion.div>
          )}

          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
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
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: theme.palette.primary.main,
                  },
                },
              }}
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={isVerifying}
              component={motion.button}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              sx={{
                mt: 3,
                py: 1.5,
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                fontWeight: 600,
                fontSize: '1rem',
                textTransform: 'none',
                boxShadow: theme.shadows[4],
                '&:hover': {
                  boxShadow: theme.shadows[8],
                },
              }}
            >
              {isVerifying ? '認証中...' : '認証'}
            </Button>
          </motion.form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ViewerAuthPage;
