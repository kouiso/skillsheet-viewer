import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**', '**/*.node.test.tsx'],
  },
});
