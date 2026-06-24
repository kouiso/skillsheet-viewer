import type { Metadata } from 'next';

import { assertServerEnv } from '@/lib/env';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'エンジニアスキルシート',
  description: 'エンジニアスキルシートビューア',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 必須サーバー環境変数の早期検証（リクエスト時に実行。ビルド時は no-op）。
  assertServerEnv();
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
