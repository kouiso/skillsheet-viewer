import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

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
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-sandbox'],
          ...(chromePath ? { executablePath: chromePath } : {}),
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm start -p 3210',
    port: 3210,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
