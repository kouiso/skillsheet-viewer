// 案件エディタへの導線を確かめるためのプローブ（ハーネスの selector を決めるためだけのもの）。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round13';
const sheetId = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await p.getByRole('button', { name: /ログイン/ }).click();
await p.waitForURL(/builder/, { timeout: 30000 });
await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.getByRole('button', { name: process.argv[3], exact: true }).first().click();
await p.waitForTimeout(2500);
await p.getByRole('button', { name: '案件エディタ', exact: true }).click();
await p.waitForTimeout(2500);
console.log(JSON.stringify({
  asideCount: await p.locator('aside.col-list').count(),
  asideHtml: (await p.locator('aside.col-list').first().innerHTML().catch(() => '')).slice(0, 3000),
  labels: await p.locator('[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))),
}, null, 2));
await p.screenshot({ path: `${OUT}/probe.png`, fullPage: true });
await b.close();
