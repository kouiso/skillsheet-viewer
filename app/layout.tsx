import type { Metadata } from 'next';

import { assertServerEnv } from '@/lib/env';

import { Providers } from './provider';
import './font.css';
import './globals.css';
import { THEME_INIT_SCRIPT } from '@/lib/theme-init-script';

export const metadata: Metadata = {
  title: 'エンジニアスキルシート',
  description: 'エンジニアスキルシートビューア',
};

// URL に Basic 認証情報が埋まってるトンネルなどで document.baseURI から認証情報を外す。
// さもないと tRPC の同一オリジン fetch が「URL に認証情報を含む」として拒否される。
const baseInitScript = `(function(){try{var b=document.querySelector('base');if(!b){b=document.createElement('base');document.head.prepend(b)}b.href=window.location.origin+'/';}catch(e){}})()`;

// FOUC 防止: ハイドレーション前に localStorage → .dark クラスを適用する。
// global-error.tsx でも同じものが必要なので定数を共有する。
const themeInitScript = THEME_INIT_SCRIPT;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  assertServerEnv();
  return (
    <html lang="ja" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: baseURI から認証情報を除去し相対 URL の fetch を有効化する */}
        <script dangerouslySetInnerHTML={{ __html: baseInitScript }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: テーマ FOUC 防止スクリプト（ハイドレーション前に実行が必須） */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
