// C-2 の永続化サブステップだけを精密に測り直す。
// 前回の測定は 2 点が誤りだった:
//   1. 追加ボタンとパレットチップが同名なので .first() がチップを掴んでいた → .last() を使う
//   2. リロードで既定シートに戻る（選択シートは URL クエリ管理）→ ?sheet=<id> で開き直す
// 対象は C-10 で作った検証用シート。本シートは触らない。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round4';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const login = await ctx.newPage();
await login.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await login.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await login.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await login.getByRole('button', { name: /ログイン/ }).click();
await login.waitForURL(/builder/, { timeout: 30000 });
await login.close();

const p = await ctx.newPage();
const handles = () => p.locator('[aria-label="ブロックを並べ替え"]').count();
const title = () => p.locator('#sheet-title').inputValue();

await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);

// 検証用シート（Full …）を選ぶ。無ければ本シートを避けたいので中断する。
const testSheet = p.locator('button', { hasText: /^Full \d+$/ }).first();
if (!(await testSheet.count())) throw new Error('検証用シートが見つからない');
await testSheet.click();
await p.waitForTimeout(2500);
const sheetUrl = p.url();

const r = { sheetUrl, sheet: await title(), beforeAdd: await handles() };

// 追加ボタンはパレットチップと同名。パレットが先に出るので .last() を取る。
r.addedLabels = [];
for (const label of ['テキスト', 'テーブル', 'スキル一覧', '職務経歴']) {
  const btn = p.getByRole('button', { name: label, exact: true });
  const n = await btn.count();
  const before = await handles();
  await btn.last().click();
  await p.waitForTimeout(600);
  const after = await handles();
  r.addedLabels.push({ label, candidates: n, delta: after - before });
}
r.afterAdd = await handles();
await p.screenshot({ path: `${OUT}/C-2-after-add.png` });

await p.getByRole('button', { name: /^保存$/ }).first().click();
await p.waitForTimeout(3000);
r.saveToast = await p
  .locator('text=保存しました')
  .first()
  .innerText()
  .catch(() => null);

// 同じシートを URL 指定で開き直す
await p.goto(sheetUrl, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
r.sheetAfterReload = await title();
r.afterReload = await handles();
await p.screenshot({ path: `${OUT}/C-2-after-reload.png` });

const body = await p.evaluate(() => document.body.innerText);
r.markers = {
  tableRowButton: body.includes('行を追加'),
  skillsAddButton: body.includes('スキルを追加'),
};
r.sameSheet = r.sheet === r.sheetAfterReload;
r.persisted = r.sameSheet && r.afterReload === r.afterAdd;

await ctx.close();
await browser.close();
writeFileSync(`${OUT}/C-2-persistence.json`, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r, null, 2));
