import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // @react-pdf/renderer はサーババンドルから外部化する（ネイティブ require / RSC 干渉回避）
  serverExternalPackages: ['@react-pdf/renderer'],
  // pnpm dev -p 3210 で 127.0.0.1 からアクセスしたときに HMR WebSocket が
  // クロスオリジンでブロックされて画面が真っ白になるのを防ぐ
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default withBundleAnalyzer(nextConfig);
