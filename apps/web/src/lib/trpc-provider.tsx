'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';

import { trpc } from './trpc-client';

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
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
