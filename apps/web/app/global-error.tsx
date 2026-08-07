'use client';

import { useEffect } from 'react';

import { ConfigErrorNotice } from '@/component/config-error-notice';

import './globals.css';

/**
 * ルートレイアウト（layout.tsx）自体が投げるエラーを受け取る最後の境界。
 *
 * `error.tsx` はレイアウトの子（page.tsx 等）が投げたエラーしか捕まえず、
 * レイアウト自身が投げるエラーは対象外（Next.js の仕様。ルートレイアウトを
 * 上書きできる境界は global-error.tsx のみ）。このアプリで layout.tsx が
 * 同期的に throw しうるのは `assertServerEnv()`（必須環境変数の欠落）だけなので
 * （レビュー指摘: このファイルが無いと、DATABASE_URL 等の未設定時に
 * `/view` 系の isConfigError() 分岐にすら到達せず、素の Next.js デフォルト
 * エラー画面になっていた）、ここに来た場合は常に設定不備として案内する。
 *
 * global-error.tsx はルートレイアウト全体を置き換えるため、html/body タグを
 * 自前で持つ必要がある（Providers・テーマ初期化スクリプトは意図的に省略:
 * ここに来る時点で layout.tsx 自体が動いていない）。
 */
export default function GlobalError({ error: err }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('Root layout error boundary:', err);
  }, [err]);

  return (
    <html lang="ja">
      <body>
        <ConfigErrorNotice
          title="サーバー設定が完了していません"
          message="必須の環境変数が設定されていない可能性があります。管理者に設定を依頼してください。"
        />
      </body>
    </html>
  );
}
