import path from 'node:path';

import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // pnpm monorepo: ワークスペースルートを明示（複数 lockfile 誤検出の回避）
  turbopack: {
    root: path.resolve(import.meta.dirname, '..', '..'),
  },
  // 内部ワークスペースパッケージ（TS ソースのまま）を Next にトランスパイルさせる
  transpilePackages: ['@skillsheet/db'],
  // @react-pdf/renderer はサーババンドルから外部化する（ネイティブ require / RSC 干渉回避）
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default withBundleAnalyzer(nextConfig);
