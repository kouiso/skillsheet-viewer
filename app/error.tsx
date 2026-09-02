'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { captureError } from '@/lib/observability/capture';

// 動的ルート（/view/[path] 等）のサーバー側システムエラーを受け取るセグメント境界。
// ファイル不在は notFound() で、設定不備（GitHub/DB未設定等）は isConfigError() で別扱い、
// ここには予期せぬ障害だけが届く（#157）。
// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js error boundary requires this function name
export default function Error({ error: err, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Route error boundary:', err);
    // digest がある＝サーバーが投げたエラーで、onRequestError（instrumentation.ts）が
    // 既にスタック付きで報告済み。ここで重ねて送ると同じ障害が2件の Issue に分かれる。
    if (!err.digest) {
      captureError(err, { scope: 'route-error-boundary' });
    }
  }, [err]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-2xl font-bold">エラーが発生しました</h2>
      <p className="text-muted-foreground">スキルシートの読み込みに失敗しました。時間をおいて再度お試しください。</p>
      <Button onClick={reset}>再試行</Button>
    </div>
  );
}
