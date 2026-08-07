// 画素差分が本当に「見えるフォーカス表示」かを目で確かめるため、
// 代表 2 要素（ビューアの .softbtn とログインの送信ボタン）の周辺を拡大して撮る。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round13';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 });

const auth = await ctx.newPage();
await auth.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await auth.locator('input').first().fill(process.env.VIEWER_CODE);
await auth.getByRole('button', { name: '認証' }).click();
await auth.waitForLoadState('networkidle');
await auth.close();

const shot = async (page, locator, name) => {
  const box = await locator.boundingBox();
  const pad = 10;
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
  });
};

const v = await ctx.newPage();
await v.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
await v.waitForTimeout(2500);
const softbtn = v.getByRole('button', { name: '工程の俯瞰' });
await shot(v, softbtn, 'E-3-softbtn-blur');
await softbtn.focus();
await v.waitForTimeout(400);
await shot(v, softbtn, 'E-3-softbtn-focus');
// キーボード由来のフォーカス（:focus-visible）でも撮る
await v.keyboard.press('Tab');
await v.keyboard.press('Shift+Tab');
await v.waitForTimeout(400);
await shot(v, softbtn, 'E-3-softbtn-focus-keyboard');
await v.close();

const l = await ctx.newPage();
await l.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await l.waitForTimeout(1500);
const submit = l.getByRole('button', { name: /ログイン/ });
await shot(l, submit, 'E-3-login-btn-blur');
await submit.focus();
await l.waitForTimeout(400);
await shot(l, submit, 'E-3-login-btn-focus');
await l.close();

await ctx.close();
await b.close();
console.log('shots written');
