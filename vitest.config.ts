import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          setupFiles: './src/test/setup.ts',
          css: true,
          include: ['app/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
          exclude: ['src/db/**'],
        },
      },
      {
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/db/**/*.test.ts'],
        },
      },
    ],
  },
});
