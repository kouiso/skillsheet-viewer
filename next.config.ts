import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // リポジトリルートがそのままプロジェクトルート。明示しないと Turbopack が
  // 上位ディレクトリまで lockfile を探しに行き、無関係な祖先をルートと誤検出する。
  turbopack: {
    root: import.meta.dirname,
  },
  // @react-pdf/renderer はサーババンドルから外部化する（ネイティブ require / RSC 干渉回避）
  serverExternalPackages: ['@react-pdf/renderer'],
  // pnpm dev -p 3210 で 127.0.0.1 からアクセスしたときに HMR WebSocket が
  // クロスオリジンでブロックされて画面が真っ白になるのを防ぐ
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

// Sentry が最外。最終的に解決された Turbopack 設定にパッチを当てるため、
// withBundleAnalyzer より内側だと Sentry から見える設定が古いままになる。
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // トークンが無いビルド（ローカル・CI・トークン未設定のプレビュー）では
  // source map 関連の処理そのものを止める。ビルドは落とさない。
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: true,
});
