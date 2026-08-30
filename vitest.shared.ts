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
    // `.claude/worktrees/**` は git worktree の実体で、別ブランチのソースがそのまま置かれる。
    // 除外しないと、そこにある古いテストまで拾って落ち、いま直したい変更の合否が読めなくなる
    // （実測: 19 ファイル・94 件が worktree 側の失敗で、本体は全件通過していた）。
    // `.evidence/**` は動作確認の証跡置き場（git 管理外）。使い捨ての検証ハーネスを置くため、
    // 本体のテスト実行が拾うと、証跡の作り直し忘れでいつまでも赤いままになる。
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**', '.claude/worktrees/**', '.evidence/**'],
  },
});
