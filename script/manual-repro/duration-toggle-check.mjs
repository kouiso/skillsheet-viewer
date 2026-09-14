import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3103';
const CODE = process.env.VIEWER_CODE;
const ROUTE = '/view/db/18a79e66-75e2-47e8-922e-d61342bb5233';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${BASE}/viewer-auth?next=${encodeURIComponent(ROUTE)}`, { waitUntil: 'domcontentloaded' });
await page.getByLabel('認証コード').fill(CODE);
await page.getByRole('button', { name: '認証' }).click();
await page.waitForURL(`**${ROUTE}`, { timeout: 30000 });
// シート本文（期間表記の「〜」を含む要素）が描画されるまで待つ — networkidle では遅延描画を拾えない。
await page.waitForSelector('text=/〜/', { timeout: 30000 });
await page.waitForTimeout(1200);

const countDuration = async () =>
  page.evaluate(() => (document.body.innerText.match(/（[^）]*ヶ月）|（継続中）/g) ?? []).length);

const onCount = await countDuration();
const onSample = await page.evaluate(() => (document.body.innerText.match(/（[^）]*ヶ月）|（継続中）/g) ?? []).slice(0, 8));

const toggle = page.getByRole('button', { name: '稼働月数' });
console.log('toggle aria-pressed (初期):', await toggle.getAttribute('aria-pressed'));
await toggle.click();
await page.waitForTimeout(800);
const offCount = await countDuration();
console.log('toggle aria-pressed (OFF後):', await page.getByRole('button', { name: '稼働月数' }).getAttribute('aria-pressed'));
// OFF 中も期間表記自体は残ること（「〜」を含む行があること）
const periodStillThere = await page.evaluate(() => (document.body.innerText.match(/〜/g) ?? []).length);

await page.screenshot({ path: '/tmp/shots-i288/toggle-off-desktop1280.png', fullPage: true });

await page.getByRole('button', { name: '稼働月数' }).click();
await page.waitForTimeout(800);
const onAgain = await countDuration();
await page.screenshot({ path: '/tmp/shots-i288/toggle-on-desktop1280.png', fullPage: true });

// モバイル 390px: ON → OFF で同じ挙動か
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page2 = await ctx2.newPage();
await page2.goto(`${BASE}/viewer-auth?next=${encodeURIComponent(ROUTE)}`, { waitUntil: 'domcontentloaded' });
await page2.getByLabel('認証コード').fill(CODE);
await page2.getByRole('button', { name: '認証' }).click();
await page2.waitForURL(`**${ROUTE}`, { timeout: 30000 });
await page2.waitForSelector('text=/〜/', { timeout: 30000 });
await page2.waitForTimeout(1200);
const onMobile = await page2.evaluate(() => (document.body.innerText.match(/（[^）]*ヶ月）|（継続中）/g) ?? []).length);
await page2.getByRole('button', { name: '稼働月数' }).click();
await page2.waitForTimeout(800);
const offMobile = await page2.evaluate(() => (document.body.innerText.match(/（[^）]*ヶ月）|（継続中）/g) ?? []).length);
await page2.screenshot({ path: '/tmp/shots-i288/toggle-off-mobile390.png', fullPage: true });
await page2.getByRole('button', { name: '稼働月数' }).click();
await page2.waitForTimeout(800);
await page2.screenshot({ path: '/tmp/shots-i288/toggle-on-mobile390.png', fullPage: true });

console.log(JSON.stringify({ onCount, offCount, onAgain, onMobile, offMobile, periodStillThere, onSample, errors }, null, 2));
await browser.close();
