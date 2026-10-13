import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { assertIsolatedE2eEnv } from './script/require-isolated-db';

// e2e は使い捨ての隔離 DB でだけ動かす。次の .env.local の読み込みは正本の共有 DB（本番）を指す
// DATABASE_URL を持ち込むので、読む前の環境で判定する（#346）。
assertIsolatedE2eEnv(process.env);
// Playwright 実行プロセスでも .env.local を読み込む（Web サーバーは Next.js が読むがテスト本体は読まないため）。
const rootDir = dirname(fileURLToPath(import.meta.url));
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(resolve(rootDir, '.env.local'));

const baseURL = process.env.PLAYWRIGHT_BASEURL ?? 'http://127.0.0.1:3210';
const chromePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/playwright/results.json' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      args: ['--no-sandbox'],
      ...(chromePath ? { executablePath: chromePath } : {}),
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-sandbox'],
          ...(chromePath ? { executablePath: chromePath } : {}),
        },
      },
    },
    {
      name: 'Desktop Chrome',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
        launchOptions: {
          args: ['--no-sandbox'],
          ...(chromePath ? { executablePath: chromePath } : {}),
        },
      },
    },
  ],
  webServer: {
    command: 'PORT=3210 pnpm start',
    port: 3210,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
