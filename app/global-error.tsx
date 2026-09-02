'use client';

import { useEffect } from 'react';

import { ConfigErrorNotice } from '@/components/config-error-notice';
import { captureWarning } from '@/lib/observability/capture';
import { THEME_INIT_SCRIPT } from '@/lib/theme-init-script';

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
 * 自前で持つ必要がある（Providers は意図的に省略: ここに来る時点で layout.tsx 自体が動いていない）。
 * ただしテーマ初期化だけは省略しない。省くと暗いテーマの利用者に突然まぶしい白画面が出て、
 * 「アプリが壊れた」という印象がエラー内容より先に伝わってしまう。
 */
export default function GlobalError({ error: err }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('Root layout error boundary:', err);
    // ここに来る時点で常に設定不備（このファイル冒頭のコメント参照）。バグ報告ではなく
    // 「デプロイが壊れとる」信号として warning レベルで送る。固定 fingerprint で
    // 同じ Issue に集約する（欠落変数が違っても、案内すべき対処は同じ）。
    captureWarning(err, { scope: 'config-error-boundary', fingerprint: ['config-error-boundary'] });
  }, [err]);

  return (
    <html lang="ja">
      <head>
        {/* layout.tsx と同じ FOUC 防止スクリプト。Providers 抜きでも配色だけは揃える。 */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 定数スクリプト。外部入力を含まない。 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground">
        <ConfigErrorNotice
          title="サーバー設定が完了していません"
          message="必須の環境変数が設定されていない可能性があります。管理者に設定を依頼してください。"
        />
      </body>
    </html>
  );
}
