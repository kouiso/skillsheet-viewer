// #156 が名指ししている技術チップ（.techtag）と技術フィルタ入力を、キーボードフォーカスで拡大撮影する。
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

const p = await ctx.newPage();
await p.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

// Tab を進めて .techtag に当たるまで進む
const chain = [];
let found = null;
for (let i = 0; i < 20; i += 1) {
  await p.keyboard.press('Tab');
  await p.waitForTimeout(120);
  const cur = await p.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return null;
    return { tag: e.tagName.toLowerCase(), cls: String(e.className), label: (e.textContent || '').trim().slice(0, 18) };
  });
  if (!cur) break;
  chain.push(cur);
  if (found === null && (cur.cls.includes('chip') || cur.cls.includes('techtag'))) found = i;
}
console.log(JSON.stringify({ chain }, null, 2));
const shot = async (name) => {
  const box = await p.evaluate(() => {
    const r = document.activeElement.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await p.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 },
  });
};
if (found !== null) {
  // 見つかった位置まで戻さず、いま当たっているチップをそのまま撮る
  await p.waitForTimeout(400);
  await shot('E-3-techtag-focus');
  const info = await p.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return {
      label: document.activeElement.textContent.trim().slice(0, 20),
      className: document.activeElement.className,
      outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      boxShadow: s.boxShadow,
    };
  });
  console.log(JSON.stringify({ tabIndexReached: found, ...info }, null, 2));
} else {
  console.log(JSON.stringify({ techtagFound: false }));
}
await ctx.close();
await b.close();
