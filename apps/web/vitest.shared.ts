import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * jsdom 側（vitest.config.ts）と node 側（vitest.config.pdf.ts）で共通の設定。
 * 別々に書くと `@` の解決や除外パターンが片方だけずれ、
 * 「片方の環境でだけテストが拾われない」状態に気づけない。
 */
export const sharedVitestConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // `server-only` は「クライアントに混ざったら落とす」ためのパッケージで、
      // 既定の解決先が必ず throw する。テストはサーバ実行に相当するので空モジュールに差し替える。
      'server-only': path.resolve(import.meta.dirname, './src/test/server-only-stub.ts'),
    },
  },
  test: {
    globals: true,
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
  },
});
