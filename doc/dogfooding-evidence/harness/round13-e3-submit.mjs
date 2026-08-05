// 送信ボタンのフォーカス表示を、キーボード Tab で当てたうえで要素の外側まで含めて撮る。
// ring-offset-2 のリングは要素のボーダーボックスの外に出るので、element.screenshot() では写らない。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round13';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);

const clipShot = async (name) => {
  const box = await p.evaluate(() => {
    const r = document.activeElement.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await p.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 },
  });
};

// Tab を押して送信ボタンに当てる
let hit = false;
for (let i = 0; i < 10; i += 1) {
  await p.keyboard.press('Tab');
  await p.waitForTimeout(200);
  const label = await p.evaluate(() => (document.activeElement?.textContent || '').trim());
  if (label === 'ログイン') {
    hit = true;
    break;
  }
}
const info = await p.evaluate(() => {
  const e = document.activeElement;
  const s = getComputedStyle(e);
  return {
    label: (e.textContent || '').trim(),
    matchesFocusVisible: e.matches(':focus-visible'),
    outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
    boxShadow: s.boxShadow,
  };
});
if (hit) await clipShot('E-3-login-submit-tabfocus');
console.log(JSON.stringify({ hit, ...info }, null, 2));
await ctx.close();
await b.close();
