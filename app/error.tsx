'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

// 動的ルート（/view/[path]・/compare）のサーバー側システムエラーを受け取る
// セグメント境界。ファイル不在は notFound() で別扱い、ここには予期せぬ障害だけが届く。
// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js error boundary requires this function name
export default function Error({ error: err, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Route error boundary:', err);
  }, [err]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-2xl font-bold">エラーが発生しました</h2>
      <p className="text-muted-foreground">スキルシートの読み込みに失敗しました。時間をおいて再度お試しください。</p>
      <Button onClick={reset}>再試行</Button>
    </div>
  );
}
