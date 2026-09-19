import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

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
// e2e 専用 DB（#346）。.env.local の DATABASE_URL は正本の共有 DB を指すため、
// e2e が migrate・行作成・principals 張替えを行うと本番データを壊す。
// .env.e2e（または環境変数）に E2E_DATABASE_URL を置けば、このプロセスと
// webServer 双方の DATABASE_URL を e2e 専用 DB へ切り替える。
loadEnvFile(resolve(rootDir, '.env.e2e'));
if (process.env.E2E_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
}

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
