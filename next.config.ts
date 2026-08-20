import bundleAnalyzer from '@next/bundle-analyzer';
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

export default withBundleAnalyzer(nextConfig);
