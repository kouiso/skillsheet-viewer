'use client';

import { TRPCClientError } from '@trpc/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/component/ui/button';
import { Input } from '@/component/ui/input';
import { track } from '@/lib/observability/capture';
import { trpc } from '@/lib/trpc-client';
import { cn } from '@/lib/utils';
import { readRetryAfterSeconds } from '@/util/read-retry-after';
import { resolveNextPath } from '@/util/resolve-next-path';

// 板 G の 3a（コードが違う）・3b（通信できない）・4（締め出し中）。
type Notice = { kind: 'invalid' } | { kind: 'network' } | { kind: 'locked'; until: number };

// 応答に retry-after が無い時の目安。viewer-rate-limit.ts の LOCK_MS（15 分）。
const LOCK_FALLBACK_SECONDS = 15 * 60;

const NOTICE_TEXT = {
  invalid: 'コードが違います。共有した人に確かめてください。',
  network: 'つながりませんでした。もう一度お試しください',
  locked: 'コードの間違いが続いたため、しばらく入力できません。15分ほど待ってからお試しください。',
} as const;

const ViewerAuthPage = () => {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  // 締め出しの残り時間を出すための現在時刻。締め出し中だけ 1 秒ごとに進める。
  const [now, setNow] = useState(() => Date.now());
  // hydration 完了前は「見た目では入力済みでも code state は空」になり得る
  // （controlled input の値と state がズレる間に submit されると空コードで 401 になる）。
  // React が DOM を引き継いだ後にだけ走る effect を「画面の準備完了」シグナルとし、
  // それまでは入力・送信を両方無効化する（#398）。
  const [mounted, setMounted] = useState(false);
  const loginMutation = trpc.auth.login.useMutation();

  useEffect(() => setMounted(true), []);

  const lockedUntil = notice?.kind === 'locked' ? notice.until : null;
  const locked = lockedUntil !== null && now < lockedUntil;

  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      // 締め出しが明けたら知らせを消して、また入力できるようにする（入力した値は残す）。
      if (current >= lockedUntil) setNotice(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ボタンの disabled だけでは素通しする経路（Enter キー・requestSubmit() 等の
    // プログラマティックな submit）が残るため、ハンドラ側でも初期化前を拒否する。
    if (!mounted || locked || loginMutation.isPending) return;
    setNotice(null);

    try {
      await loginMutation.mutateAsync({ code });
      track({ name: 'viewer_auth_submitted', outcome: 'success' });
      // 認証後の遷移先。?next= が内部パスのときのみ許可（オープンリダイレクト防止）。
      const next = new URLSearchParams(window.location.search).get('next');
      const dest = resolveNextPath(next, '/view', window.location.origin);
      router.push(dest);
    } catch (err) {
      if (err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED') {
        setNotice({ kind: 'invalid' });
        track({ name: 'viewer_auth_submitted', outcome: 'invalid_code' });
      } else if (err instanceof TRPCClientError && err.data?.code === 'TOO_MANY_REQUESTS') {
        const current = Date.now();
        setNow(current);
        setNotice({ kind: 'locked', until: current + (readRetryAfterSeconds(err) ?? LOCK_FALLBACK_SECONDS) * 1000 });
        track({ name: 'viewer_auth_submitted', outcome: 'rate_limited' });
      } else {
        setNotice({ kind: 'network' });
        track({ name: 'viewer_auth_submitted', outcome: 'error' });
      }
    }
  };

  const buttonLabel = !mounted
    ? '準備しています…'
    : locked
      ? `あと ${Math.max(1, Math.ceil(((lockedUntil ?? now) - now) / 60_000))}分 で入力できます`
      : loginMutation.isPending
        ? '認証中...'
        : notice?.kind === 'invalid'
          ? 'もう一度認証'
          : '認証';

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

        {notice ? (
          <div
            role="alert"
            className={cn(
              'rounded-[4px] px-3 py-2.5 text-[13px] leading-[1.6]',
              notice.kind === 'locked'
                ? // 板 G の黄の知らせ。文字 #6b4400 / 地 #fdf6e6（ダークは #f5c66b / #2a2210）。
                  'bg-[#fdf6e6] text-[#6b4400] dark:bg-[#2a2210] dark:text-[#f5c66b]'
                : // 板 G の赤の知らせ。文字 #b64437 / 地 #fbf0ef（ダークは #f28b7f / #2a1513）。
                  'bg-[#fbf0ef] text-[#b64437] dark:bg-[#2a1513] dark:text-[#f28b7f]',
            )}
          >
            {NOTICE_TEXT[notice.kind]}
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
          disabled={!mounted || locked}
          placeholder="000000"
          // 元は autoComplete="off"。共有コードはメールを消すと再取得できず、
          // ブラウザ/パスワードマネージャが保存も補完もできないと締め出しに
          // 直結する。この欄はメールに書かれた共有コードの入力欄であり、
          // ログインID等ではないので個人情報の懸念も無い。name を明示し、
          // autoComplete も外して保存・補完を許可する。
          className={cn(
            'h-12 rounded-[4px] bg-card px-3.5 font-mono text-lg font-medium tracking-[0.2em] shadow-none',
            notice?.kind === 'invalid' && 'border-[#b64437] dark:border-[#f28b7f]',
          )}
        />
        <Button
          type="submit"
          // 地の色は既存の primary-dark のまま。板の pri #0d9488 に白文字は 3.74:1 で AA 未達（#198）。
          className="h-12 w-full rounded-[4px] text-sm shadow-none! hover:shadow-none! disabled:opacity-[0.45]"
          disabled={!mounted || locked || loginMutation.isPending}
        >
          {buttonLabel}
        </Button>
      </form>
    </main>
  );
};

export default ViewerAuthPage;
