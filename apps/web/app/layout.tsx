import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_JP } from 'next/font/google';

import { assertServerEnv } from '@/lib/env';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'エンジニアスキルシート',
  description: 'エンジニアスキルシートビューア',
};

// IBM Plex Sans JP — CJK サブセット最適化（preload:false で build 通過）
const ibmPlexSansJP = IBM_Plex_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-sans-jp',
  preload: false,
  display: 'swap',
});

// 600 は StatRow の数値・工程ドーナツの件数など「計器」表現で使う。
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-mono',
  preload: false,
  display: 'swap',
});

// URL に Basic 認証情報が埋まってるトンネルなどで document.baseURI から認証情報を外す。
// さもないと tRPC の同一オリジン fetch が「URL に認証情報を含む」として拒否される。
const baseInitScript = `(function(){try{var b=document.querySelector('base');if(!b){b=document.createElement('base');document.head.prepend(b)}b.href=window.location.origin+'/';}catch(e){}})()`;

// FOUC 防止: ハイドレーション前に localStorage → .dark クラスを適用する
const themeInitScript = `(function(){try{var m=localStorage.getItem('theme-mode');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(m==='dark'||(!m&&d)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  assertServerEnv();
  return (
    <html lang="ja" suppressHydrationWarning className={`${ibmPlexSansJP.variable} ${ibmPlexMono.variable}`}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: baseURI から認証情報を除去し相対 URL の fetch を有効化する */}
        <script dangerouslySetInnerHTML={{ __html: baseInitScript }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: テーマ FOUC 防止スクリプト（ハイドレーション前に実行が必須） */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
