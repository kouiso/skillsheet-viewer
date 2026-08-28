import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedVitestConfig } from './vitest.shared';

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      // PDF の実バイト描画は vitest.config.pdf.ts、DB 層と CLI スクリプトは
      // vitest.config.node.ts が、それぞれ node 環境で受け持つ。
      exclude: ['e2e/**', '**/node_modules/**', '**/dist/**', '**/*.node.test.tsx', 'src/db/**', 'scripts/**'],
    },
  }),
);
