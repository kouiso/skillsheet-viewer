// Console デザイントークン（light）の単一の真実。
// app/globals.css の :root ブロックと値を一致させること（design-tokens.test.ts で検証）。
// @react-pdf/renderer は CSS 変数を解決できないため、PDF 側はこの定数を import して使う。
export const DESIGN_TOKENS_LIGHT = {
  foreground: '#10171a',
  primary: '#0d9488',
  primaryDark: '#08665e',
  mutedForeground: '#4a565c',
  muted: '#f0f3f3',
  border: '#dce3e4',
} as const;
