'use client';

import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { signIn } from '@/lib/auth-client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError('メールアドレスまたはパスワードが正しくありません');
        return;
      }
      const next = searchParams.get('next');
      const dest = next?.startsWith('/') && !next.startsWith('//') ? next : '/builder';
      router.push(dest);
    } catch {
      setError('ログインに失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-4"
    >
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          メールアドレス
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="editor@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          パスワード
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={loading}>
        {loading ? 'ログイン中...' : 'ログイン'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        閲覧のみの場合は{' '}
        <Link href="/viewer-auth" className="text-primary underline underline-offset-2">
          閲覧コード認証
        </Link>
      </p>
    </motion.form>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-primary to-secondary px-4">
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
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              className="mb-4 flex justify-center"
            >
              <div className="flex size-20 items-center justify-center rounded-full bg-linear-to-br from-primary to-secondary shadow-elevation-4">
                <LogIn className="size-10 text-white" />
              </div>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-center text-2xl font-bold"
            >
              編集者ログイン
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="mb-6 mt-2 text-center text-sm text-muted-foreground"
            >
              スキルシートビルダーへのアクセス
            </motion.p>
            <Suspense>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
