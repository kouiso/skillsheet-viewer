// E-3 の決定版測定: 計算スタイルの差分は transition の途中値を拾って当てにならんかったので、
// 「フォーカス時の要素の見た目」と「ブラー後の見た目」を実際に撮って画素で比べる。
// 差が出れば視覚的なフォーカス表示がある、出なければ無い。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round13';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
const MAX_STOPS = 14;

const SCREENS = [
  ['/login', 'login'],
  ['/viewer-auth', 'viewer-auth'],
  ['/view', 'view-list'],
  [`/view/db/${SHEET}`, 'view-db-sheet'],
  ['/builder', 'builder'],
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

const hash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 12);
const out = {};

for (const [path, label] of SCREENS) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const stops = [];
  for (let i = 0; i < MAX_STOPS; i += 1) {
    await p.keyboard.press('Tab');
    await p.waitForTimeout(320); // transition が落ち着くまで待つ
    const el = await p.evaluateHandle(() => document.activeElement);
    const meta = await el.evaluate((e) =>
      !e || e === document.body
        ? null
        : { tag: e.tagName.toLowerCase(), label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24) },
    );
    if (!meta) break;
    let focusedShot;
    try {
      focusedShot = await el.asElement().screenshot({ timeout: 5000 });
    } catch {
      stops.push({ ...meta, ring: null, note: 'not visible' });
      continue;
    }
    await el.evaluate((e) => e.blur());
    await p.waitForTimeout(320);
    const blurredShot = await el.asElement().screenshot({ timeout: 5000 });
    stops.push({ ...meta, ring: hash(focusedShot) !== hash(blurredShot) });
    // 次の Tab が先頭に戻らないよう、フォーカスを戻してから進める
    await el.evaluate((e) => e.focus());
  }
  out[label] = {
    path,
    checked: stops.length,
    withRing: stops.filter((s) => s.ring === true).length,
    withoutRing: stops.filter((s) => s.ring === false).map((s) => `${s.tag}:${s.label}`),
    skipped: stops.filter((s) => s.ring === null).length,
  };
  await p.close();
}

await ctx.close();
await b.close();
writeFileSync(`${OUT}/E-3-pixel.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
