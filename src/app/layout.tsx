import type { Metadata } from 'next';

import Providers from '@/components/Providers';

import './globals.css';

export const metadata: Metadata = {
  title: 'スキルシート管理システム',
  description: 'Markdownで管理できるスキルシート・ポートフォリオサイト',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
