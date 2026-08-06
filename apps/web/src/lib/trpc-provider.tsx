'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';

import { trpc } from './trpc-client';

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // react-query の既定 networkMode: 'online' は navigator.onLine が false の間
          // fetch 自体を発行せず mutate/query を "paused" のまま止める（実際のネットワーク
          // エラーとして reject しない）。旧 Server Action 実装は素の fetch 呼び出しで
          // オフライン時に即 reject していたため、自動保存の「失敗」表示（isDirty のまま
          // エラー状態にする既存ロジック）が機能しなくなり、保存中インジケータが無期限に
          // 残ってしまう（headless E2E の autosave.spec.ts オフラインケースで再現・確認済み）。
          // 'always' にして実際の fetch 失敗を reject させ、旧実装と同じ即時失敗の挙動に揃える。
          queries: { networkMode: 'always' },
          mutations: { networkMode: 'always' },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          transformer: superjson,
          // 相対パスで同一オリジンへ送る。'use client' コンポーネントも初回は SSR/SSG
          // されるため、ここは実際に fetch を発行するわけではない
          // （RSC ページのデータ取得は server caller が別途担う。react-query 側の
          // クエリはユーザー操作後のクライアント実行のみで、SSR 中に発火しない）。
          url: '/api/trpc',
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
