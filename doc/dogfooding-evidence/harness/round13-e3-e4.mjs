// 13 巡目 E-3 / E-4 追試。
// E-4: E-1 で撮った全ルートの console.error 件数をルートごとに採る（ビューア経路だけで代表させない）。
// E-3: 画面ごとに Tab の到達先とフォーカスリングの有無を採る（ビューアだけで代表させない）。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round13';
mkdirSync(OUT, { recursive: true });
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';

const ROUTES = [
  ['/view', 'view-list'],
  ['/view/db', 'view-db-list'],
  [`/view/db/${SHEET}`, 'view-db-sheet'],
  ['/view/db/00000000-0000-4000-8000-000000000000', 'view-db-missing'],
  ['/builder', 'builder'],
  ['/builder/preview', 'builder-preview'],
  ['/compare', 'compare'],
  ['/login', 'login'],
  ['/viewer-auth', 'viewer-auth'],
  ['/view/skillsheet.md', 'view-path'],
  ['/this-route-does-not-exist', 'not-found'],
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });

// 閲覧コード + 編集者セッションの両方を持たせる（全ルートを認証済みで通すため）。
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

// ---------- E-4: ルートごとの console.error ----------
const e4 = {};
for (const [path, label] of ROUTES) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
  p.on('pageerror', (e) => errs.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  const resp = await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => null);
  await p.waitForTimeout(2500);
  e4[label] = {
    path,
    status: resp?.status() ?? null,
    finalPath: new URL(p.url()).pathname,
    consoleErrors: errs.length,
    samples: errs.slice(0, 3),
  };
  await p.close();
}

// ---------- E-3: 画面ごとの Tab 到達とフォーカスリング ----------
const KEYBOARD = [
  ['/login', 'login'],
  ['/viewer-auth', 'viewer-auth'],
  [`/view/db/${SHEET}`, 'view-db-sheet'],
  ['/view', 'view-list'],
  ['/builder', 'builder'],
];

const e3 = {};
for (const [path, label] of KEYBOARD) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const reached = [];
  for (let i = 0; i < 30; i += 1) {
    await p.keyboard.press('Tab');
    const info = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      // フォーカスリングは outline か box-shadow のどちらかで出る実装がある
      const ring =
        (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
        (s.boxShadow !== 'none' && s.boxShadow.length > 0);
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28),
        ring,
      };
    });
    if (!info) break;
    reached.push(info);
  }
  // 同じ要素をぐるぐるしているだけの場合を除くため、ユニーク数も採る
  const uniq = new Set(reached.map((r) => `${r.tag}:${r.label}`));
  e3[label] = {
    path,
    tabStops: reached.length,
    uniqueStops: uniq.size,
    withRing: reached.filter((r) => r.ring).length,
    stops: reached,
  };
  await p.screenshot({ path: `${OUT}/E-3-${label}.png` });
  await p.close();
}

await ctx.close();
await b.close();
writeFileSync(`${OUT}/E-3-E-4.json`, JSON.stringify({ e4, e3 }, null, 2));
console.log(
  JSON.stringify(
    {
      e4: Object.fromEntries(Object.entries(e4).map(([k, v]) => [k, { status: v.status, finalPath: v.finalPath, consoleErrors: v.consoleErrors }])),
      e3: Object.fromEntries(Object.entries(e3).map(([k, v]) => [k, { tabStops: v.tabStops, uniqueStops: v.uniqueStops, withRing: v.withRing }])),
    },
    null,
    2,
  ),
);
