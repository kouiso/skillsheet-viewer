'use client';

import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button } from '@/component/ui/button';
import { Card, CardContent } from '@/component/ui/card';
import { Input } from '@/component/ui/input';
import { signIn } from '@/lib/auth-client';
import { resolveNextPath } from '@/util/resolve-next-path';

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
      // OAuth 認可フロー（Remote MCP クライアント接続、Issue #305）経由のサインインでは、
      // セッション発行と同時に認可の続き（同意画面、またはクライアントへの code
      // リダイレクト）が { redirect: true, url } として返る。通常遷移より先にそちらへ進む。
      const oauthRedirect = (result.data as { url?: string } | null)?.url;
      if (typeof oauthRedirect === 'string' && oauthRedirect.length > 0) {
        window.location.assign(oauthRedirect);
        return;
      }
      const dest = resolveNextPath(searchParams.get('next'), '/builder', window.location.origin);
      router.push(dest);
    } catch {
      setError('ログインに失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-4"
    >
      {error && (
        <div
          role="alert"
          // text-destructive（#dc2626）は bg-destructive/10 のティント背景上で 3.88:1 と
          // WCAG AA(4.5:1) 未達だった（#152 S-4）。text-destructive-strong に切り替える。
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive-strong"
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
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? 'ログイン中...' : 'ログイン'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        閲覧のみの場合は {/* text-primary は背景に対しライトテーマで3.74と WCAG AA 未達（Issue #198）。 */}
        <Link
          href="/viewer-auth"
          className="inline-flex h-12 min-w-12 items-center justify-center rounded px-2 text-primary-dark underline underline-offset-2"
          aria-label="閲覧コード認証へ"
        >
          閲覧コード認証
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="mb-4 flex justify-center">
            <LogIn aria-hidden="true" className="size-8 text-foreground" />
          </div>
          <h1 className="text-center text-2xl font-bold">編集者ログイン</h1>
          <p className="mb-6 mt-2 text-center text-sm text-muted-foreground">
            スキルシートを編集するにはログインしてください。
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
