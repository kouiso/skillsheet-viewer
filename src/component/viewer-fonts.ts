import { JetBrains_Mono, Zen_Kaku_Gothic_New } from 'next/font/google';

// Atlas指定書体は閲覧画面にだけ適用。ビルド時取得・同一origin配信を使う。
const body = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-atlas-body',
});
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-atlas-mono' });
export const atlasFontClasses = `${body.variable} ${mono.variable}`;
