import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useThemeMode } from '@/context/theme-context';

/**
 * sonner が実行時に注入する CSS は cascade layer の外（unlayered）にあり、Tailwind v4 の
 * `@layer utilities` より詳細度に関係なく優先される。そのため toastOptions.classNames に
 * `bg-card` / `rounded-xl` / `shadow-elevation-4` を書いても sonner 既定値
 * （背景 #fff/#000・角丸 8px・`0 4px 12px rgba(0,0,0,.1)`）のまま効いていなかった（#420）。
 *
 * - 背景・文字色・枠線・角丸は sonner 公式のテーマ用 CSS 変数（`--normal-*` / `--border-radius`）を
 *   Toaster の style で上書きし、アプリのトークンへ連動させる（詳細度の奪い合いをしない）。
 * - 影だけは sonner に変数が無く `box-shadow` 直書きのため、layer 内のユーティリティが
 *   unlayered を上回れる唯一の手段である important（`!shadow-elevation-4`）を使う。
 *   important にすると sonner の `:focus-visible` の影も上書きするので、フォーカス表示は
 *   Tailwind の ring（同じ box-shadow 合成に乗る）で補う。
 */
const TOASTER_THEME_VARS = {
  '--normal-bg': 'var(--card)',
  '--normal-text': 'var(--card-foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius-xl)',
} as CSSProperties;

/** sonner ベースのトースト。MUI Snackbar/Alert の置き換え。テーマ連動。 */
const Toaster = ({ style, ...props }: ToasterProps) => {
  const { mode } = useThemeMode();

  return (
    <Sonner
      theme={mode}
      className="toaster group"
      position="bottom-center"
      style={{ ...TOASTER_THEME_VARS, ...style }}
      toastOptions={{
        classNames: {
          toast:
            'group toast !shadow-elevation-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
