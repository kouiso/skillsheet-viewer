// E-3 確定測定。実キーボード Tab のフォーカス（:focus-visible）で、
// outline と box-shadow の計算値をそのまま採る。ブラーも再フォーカスもせん（transition の途中値を拾わんため）。
// 「見えるフォーカス表示が無い」= outline が none/0 かつ box-shadow が none。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round13';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';

const SCREENS = [
  ['/login', 'login', 10],
  ['/viewer-auth', 'viewer-auth', 8],
  ['/view', 'view-list', 12],
  [`/view/db/${SHEET}`, 'view-db-sheet', 24],
  ['/builder', 'builder', 24],
  ['/builder/preview', 'builder-preview', 8],
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const auth = await ctx.newPage();
await auth.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await auth.locator('input').first().fill(process.env.VIEWER_CODE);
await auth.getByRole('button', { name: '認証' }).click();
await auth.waitForLoadState('networkidle');
await auth.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await auth.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await auth.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await auth.getByRole('button', { name: /ログイン/ }).click();
await auth.waitForURL(/builder/, { timeout: 30000 });
await auth.close();

const out = {};
for (const [path, label, max] of SCREENS) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const stops = [];
  for (let i = 0; i < max; i += 1) {
    await p.keyboard.press('Tab');
    await p.waitForTimeout(220);
    const cur = await p.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const s = getComputedStyle(e);
      const hasOutline = s.outlineStyle !== 'none' && s.outlineWidth !== '0px';
      const hasShadow = s.boxShadow !== 'none' && s.boxShadow.length > 0;
      return {
        tag: e.tagName.toLowerCase(),
        name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 22),
        focusVisible: e.matches(':focus-visible'),
        outline: `${s.outlineStyle} ${s.outlineWidth}`,
        boxShadow: hasShadow,
        indicator: hasOutline || hasShadow,
      };
    });
    if (!cur) break;
    stops.push(cur);
  }
  out[label] = {
    path,
    stops: stops.length,
    withIndicator: stops.filter((s) => s.indicator).length,
    without: stops.filter((s) => !s.indicator).map((s) => `${s.tag}:${s.name || '(無名)'}`),
  };
  await p.close();
}

await ctx.close();
await b.close();
writeFileSync(`${OUT}/E-3-final.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
