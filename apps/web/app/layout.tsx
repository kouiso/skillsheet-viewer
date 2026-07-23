import type { Metadata } from 'next';

import { assertServerEnv } from '@/lib/env';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'エンジニアスキルシート',
  description: 'エンジニアスキルシートビューア',
};

// FOUC 防止: ハイドレーション前に localStorage → .dark クラスを適用する
const themeInitScript = `(function(){try{var m=localStorage.getItem('theme-mode');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(m==='dark'||(m!=='light'&&d)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  assertServerEnv();
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: テーマ FOUC 防止スクリプト（ハイドレーション前に実行が必須） */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
