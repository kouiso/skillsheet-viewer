'use client';

import { motion } from 'framer-motion';
import { LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const ViewerAuthPage = () => {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });

      if (res.ok) {
        // 認証後の遷移先。?next= が内部パスのときのみ許可（オープンリダイレクト防止）。
        const next = new URLSearchParams(window.location.search).get('next');
        const dest = next?.startsWith('/') && !next.startsWith('//') ? next : '/view';
        router.push(dest);
        return;
      }

      if (res.status === 401) {
        setError('認証コードが正しくありません');
      } else {
        setError('認証に失敗しました。もう一度お試しください。');
      }
    } catch {
      setError('認証に失敗しました。もう一度お試しください。');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-primary to-secondary px-4">
      {/* 背景装飾 */}
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
        transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        className="pointer-events-none absolute -right-[10%] -top-[10%] size-[400px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.2)_0%,transparent_70%)]"
      />
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.3, 1], rotate: [360, 180, 0] }}
        transition={{ duration: 25, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        className="pointer-events-none absolute -bottom-[15%] -left-[10%] size-[360px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.15)_0%,transparent_70%)]"
      />

      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.43, 0.13, 0.23, 0.96] }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="border-white/20 bg-card/95 shadow-elevation-8 backdrop-blur-md">
          <CardContent className="p-8">
            {/* アイコン */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              className="mb-4 flex justify-center"
            >
              <div className="flex size-20 items-center justify-center rounded-full bg-linear-to-br from-primary to-secondary shadow-elevation-4">
                <LockKeyhole className="size-10 text-white" />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-center text-2xl font-bold"
            >
              エンジニアスキルシート閲覧
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mb-6 mt-2 text-center text-sm text-muted-foreground"
            >
              共有された認証コードを入力してください
            </motion.p>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                role="alert"
                className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
              >
                {error}
              </motion.div>
            )}

            <motion.form
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              onSubmit={(e) => {
                void handleSubmit(e);
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label htmlFor="auth-code" className="text-sm font-medium">
                  認証コード
                </label>
                <Input
                  id="auth-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={isVerifying}>
                {isVerifying ? '認証中...' : '認証'}
              </Button>
            </motion.form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ViewerAuthPage;
