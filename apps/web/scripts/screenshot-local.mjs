import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3210';
const CODE = process.env.VIEWER_CODE ?? 'view123';
const OUT = process.env.OUT ?? '/tmp/shots';
const ROUTES = (process.env.ROUTES ?? '/view/db').split(',');
const VIEWPORTS = [
  { name: 'mobile390', width: 390, height: 844 },
  { name: 'desktop1280', width: 1280, height: 900 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROME_PATH });
const report = [];

for (const theme of ['light', 'dark']) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`${BASE}/viewer-auth?next=${encodeURIComponent(ROUTES[0])}`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('認証コード').fill(CODE);
    await page.getByRole('button', { name: '認証' }).click();
    await page.waitForURL(`**${ROUTES[0]}`, { timeout: 20000 }).catch(() => {});
    await page.evaluate((t) => localStorage.setItem('theme-mode', t), theme);

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const slug = route.replace(/[^a-z0-9]/gi, '_');
      const file = `${OUT}/${theme}-${vp.name}-${slug}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      report.push({ theme, vp: vp.name, route, file, hScroll: overflow.scrollW > overflow.clientW + 1, ...overflow });
    }
    if (errors.length) report.push({ theme, vp: vp.name, consoleErrors: errors.slice(0, 5) });
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 2));
