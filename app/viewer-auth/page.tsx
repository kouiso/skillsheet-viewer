'use client';

import { TRPCClientError } from '@trpc/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/component/ui/button';
import { Input } from '@/component/ui/input';
import { track } from '@/lib/observability/capture';
import { trpc } from '@/lib/trpc-client';
import { cn } from '@/lib/utils';
import { resolveNextPath } from '@/util/resolve-next-path';

const ViewerAuthPage = () => {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  // hydration 完了前は「見た目では入力済みでも code state は空」になり得る
  // （controlled input の値と state がズレる間に submit されると空コードで 401 になる）。
  // React が DOM を引き継いだ後にだけ走る effect を「画面の準備完了」シグナルとし、
  // それまでは入力・送信を両方無効化する（#398）。
  const [mounted, setMounted] = useState(false);
  const loginMutation = trpc.auth.login.useMutation();

  useEffect(() => setMounted(true), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ボタンの disabled だけでは素通しする経路（Enter キー・requestSubmit() 等の
    // プログラマティックな submit）が残るため、ハンドラ側でも初期化前を拒否する。
    if (!mounted || loginMutation.isPending) return;
    setError('');

    try {
      await loginMutation.mutateAsync({ code });
      track({ name: 'viewer_auth_submitted', outcome: 'success' });
      // 認証後の遷移先。?next= が内部パスのときのみ許可（オープンリダイレクト防止）。
      const next = new URLSearchParams(window.location.search).get('next');
      const dest = resolveNextPath(next, '/view', window.location.origin);
      router.push(dest);
    } catch (err) {
      if (err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED') {
        setError('認証コードが正しくありません');
        track({ name: 'viewer_auth_submitted', outcome: 'invalid_code' });
      } else if (err instanceof TRPCClientError && err.data?.code === 'TOO_MANY_REQUESTS') {
        setError('認証に失敗しました。もう一度お試しください。');
        track({ name: 'viewer_auth_submitted', outcome: 'rate_limited' });
      } else {
        setError('認証に失敗しました。もう一度お試しください。');
        track({ name: 'viewer_auth_submitted', outcome: 'error' });
      }
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-8">
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        // 板 G: 影なし・枠線 1px・角丸 6px・余白 上下 28px 左右 22px・中の間隔 14px。
        className="flex w-full max-w-md flex-col gap-3.5 rounded-[6px] border border-border bg-card px-[22px] py-7 text-card-foreground"
      >
        <h1 className="text-lg font-semibold">スキルシートを見る</h1>

        {error ? (
          <div
            role="alert"
            // 板 G の赤の知らせ。文字 #b64437 / 地 #fbf0ef（ダークは #f28b7f / #2a1513）。
            className="rounded-[4px] bg-[#fbf0ef] px-3 py-2.5 text-[13px] leading-[1.6] text-[#b64437] dark:bg-[#2a1513] dark:text-[#f28b7f]"
          >
            {error}
          </div>
        ) : (
          <p className="text-[13px] leading-[1.6] text-muted-foreground">共有されたコードを入れてください。</p>
        )}

        <label htmlFor="auth-code" className="text-xs text-muted-foreground">
          コード
        </label>
        <Input
          id="auth-code"
          name="auth-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          disabled={!mounted}
          placeholder="000000"
          // 元は autoComplete="off"。共有コードはメールを消すと再取得できず、
          // ブラウザ/パスワードマネージャが保存も補完もできないと締め出しに
          // 直結する。この欄はメールに書かれた共有コードの入力欄であり、
          // ログインID等ではないので個人情報の懸念も無い。name を明示し、
          // autoComplete も外して保存・補完を許可する。
          className={cn(
            'h-12 rounded-[4px] bg-card px-3.5 font-mono text-lg font-medium tracking-[0.2em] shadow-none',
            error && 'border-[#b64437] dark:border-[#f28b7f]',
          )}
        />
        <Button
          type="submit"
          // 地の色は既存の primary-dark のまま。板の pri #0d9488 に白文字は 3.74:1 で AA 未達（#198）。
          className="h-12 w-full rounded-[4px] text-sm shadow-none! hover:shadow-none! disabled:opacity-[0.45]"
          disabled={!mounted || loginMutation.isPending}
        >
          {!mounted ? '準備しています…' : loginMutation.isPending ? '認証中...' : '認証'}
        </Button>
      </form>
    </main>
  );
};

export default ViewerAuthPage;
