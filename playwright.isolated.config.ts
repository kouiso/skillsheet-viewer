import { lstatSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// 隔離runnerが起動したサーバーだけを使う。.env読込・既存認証・サーバー自動再利用を行わない。
const baseURL = process.env.PLAYWRIGHT_BASEURL;
const output = process.env.PLAYWRIGHT_ISOLATED_OUTPUT;
if (!baseURL || !output || !isAbsolute(output)) throw new Error('ISOLATED_BROWSER_TARGET_REQUIRED');
const target = new URL(baseURL);
if (
  target.protocol !== 'http:' ||
  target.hostname !== '127.0.0.1' ||
  !target.port ||
  target.username ||
  target.password ||
  target.pathname !== '/' ||
  target.search ||
  target.hash
) {
  throw new Error('LOOPBACK_BROWSER_TARGET_REQUIRED');
}
const stat = lstatSync(output);
if (
  !stat.isDirectory() ||
  stat.isSymbolicLink() ||
  (stat.mode & 0o077) !== 0 ||
  (process.getuid && stat.uid !== process.getuid())
)
  throw new Error('PRIVATE_BROWSER_OUTPUT_REQUIRED');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pdf-export-recovery.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  outputDir: join(output, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: join(output, 'results.json') }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
