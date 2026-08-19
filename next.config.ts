import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // @react-pdf/renderer はサーババンドルから外部化する（ネイティブ require / RSC 干渉回避）
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default withBundleAnalyzer(nextConfig);
