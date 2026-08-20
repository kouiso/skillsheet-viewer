import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'server-only': path.resolve(import.meta.dirname, './src/test/server-only-stub.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.node.test.tsx'],
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
  },
});
