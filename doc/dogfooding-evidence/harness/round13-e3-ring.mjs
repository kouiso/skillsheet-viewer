// E-3 再測定: 「フォーカスリングがある」を outline/box-shadow の有無で判定すると、
// 装飾の box-shadow を数えてしまう。フォーカス時とブラー時の計算値を比較して、
// 「フォーカスで見た目が変わるか」を差分で判定する。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round13';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';

const SCREENS = [
  ['/login', 'login'],
  ['/viewer-auth', 'viewer-auth'],
  ['/view', 'view-list'],
  [`/view/db/${SHEET}`, 'view-db-sheet'],
  ['/builder', 'builder'],
  ['/builder/preview', 'builder-preview'],
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
for (const [path, label] of SCREENS) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const stops = [];
  for (let i = 0; i < 40; i += 1) {
    await p.keyboard.press('Tab');
    const info = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const read = () => {
        const s = getComputedStyle(el);
        return `${s.outlineStyle}|${s.outlineWidth}|${s.outlineColor}|${s.boxShadow}|${s.borderColor}|${s.backgroundColor}`;
      };
      const focused = read();
      el.blur();
      const blurred = read();
      el.focus();
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 26),
        // フォーカスで計算値が動くか = 見た目のフィードバックがあるか
        ringOnFocus: focused !== blurred,
      };
    });
    if (!info) break;
    stops.push(info);
  }
  const uniq = new Set(stops.map((s) => `${s.tag}:${s.label}`));
  out[label] = {
    path,
    tabStops: stops.length,
    uniqueStops: uniq.size,
    withRing: stops.filter((s) => s.ringOnFocus).length,
    withoutRing: stops.filter((s) => !s.ringOnFocus).map((s) => `${s.tag}:${s.label}`),
  };
  await p.close();
}

await ctx.close();
await b.close();
writeFileSync(`${OUT}/E-3-ring.json`, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(out).map(([k, v]) => [
        k,
        { tabStops: v.tabStops, uniqueStops: v.uniqueStops, withRing: v.withRing, noRingSample: v.withoutRing.slice(0, 6) },
      ]),
    ),
    null,
    2,
  ),
);
