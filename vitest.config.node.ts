import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedVitestConfig } from './vitest.shared';

/**
 * DB 層（`src/db`）と CLI スクリプト（`script`）は Node で動くコード。
 *
 * モノレポを畳む前は `packages/db` 側が `environment: 'node'` を明示していた。
 * ルート1本にしたあと jsdom 設定へ吸収させると、サーバ専用コードに window /
 * document が生えたうえブラウザ用の setup（jest-dom・next/image のモック・
 * localStorage / matchMedia の polyfill）まで読み込まれ、本番と違う分岐を
 * 通っても緑のままになる。環境の保証を設定として残す。
 */
export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      environment: 'node',
      // `*.node.test.ts` は node 環境専用テストの明示サフィックス（jsdom 側では除外）。
      // MCP ルート・サービス層など window/document の無い実行経路をここで検証する。
      include: ['src/db/**/*.test.ts', 'script/**/*.test.ts', '**/*.node.test.ts'],
    },
  }),
);
