import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` は「クライアントに混ざったら落とす」ためのパッケージで、
      // 既定の解決先が必ず throw する。テストはサーバ実行に相当するので無害な空モジュールに差し替える。
      'server-only': path.resolve(import.meta.dirname, './src/test/server-only-stub.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
