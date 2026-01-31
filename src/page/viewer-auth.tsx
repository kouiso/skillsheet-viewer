import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LockOpen } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useThemeMode } from '@/context/theme-context';

const ViewerAuthPage = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const { mode } = useThemeMode();

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
    <div
      className={`flex justify-center items-center min-h-screen relative overflow-hidden ${
        mode === 'dark'
          ? 'bg-gradient-to-br from-slate-900 to-slate-800'
          : 'bg-gradient-to-br from-indigo-500 to-purple-600'
      }`}
    >
      {/* 背景装飾 */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 20,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'linear',
        }}
        className={`absolute w-96 h-96 rounded-full -top-[10%] -right-[10%] ${
          mode === 'dark'
            ? 'bg-[radial-gradient(circle,rgba(99,102,241,0.1)_0%,transparent_70%)]'
            : 'bg-[radial-gradient(circle,rgba(255,255,255,0.2)_0%,transparent_70%)]'
        }`}
      />

      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.6,
          ease: [0.43, 0.13, 0.23, 0.96],
        }}
      >
        <Card
          className={`min-w-[90%] sm:min-w-[400px] max-w-[500px] backdrop-blur-md relative z-10 shadow-2xl ${
            mode === 'dark' ? 'bg-slate-800/80' : 'bg-white/95'
          }`}
        >
          <CardContent className="p-8">
            {/* アイコン */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                <LockOpen className="h-10 w-10 text-white" />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-2xl font-bold text-center mb-2"
            >
              エンジニアスキルシート閲覧
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-sm text-muted-foreground text-center mb-8"
            >
              共有された認証コードを入力してください
            </motion.p>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
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
              <div className="space-y-4">
                <div>
                  <label htmlFor="auth-code" className="block text-sm font-medium mb-2">
                    認証コード
                  </label>
                  <Input
                    id="auth-code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoComplete="off"
                    className="w-full"
                    placeholder="認証コードを入力"
                  />
                </div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    disabled={isVerifying}
                    className="w-full py-6 text-base font-semibold bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-shadow"
                  >
                    {isVerifying ? '認証中...' : '認証'}
                  </Button>
                </motion.div>
              </div>
            </motion.form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ViewerAuthPage;
