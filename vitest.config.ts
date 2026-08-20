import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedVitestConfig } from './vitest.shared';

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      // PDF の実バイト描画は node 環境（vitest.config.pdf.ts）側で行う。
      exclude: ['e2e/**', '**/node_modules/**', '**/dist/**', '**/*.node.test.tsx'],
    },
  }),
);
