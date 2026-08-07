// 9 巡目: Codex レビュー（d86e5b6）の 2 件。
// - B-10 スクロールでアクティブ見出しが追従するか（aria-current）
// - C-5  オフラインで失敗した編集そのものが、復帰後に再保存されるか
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round9';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MD_SHEET = '88883075-035c-4046-9bd4-050e01d26667';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const report = {};

const browser = await chromium.launch({ executablePath: EXE });

// ---------- B-10: アクティブ見出しの追従 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const a = await ctx.newPage();
  await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
  await a.locator('input').first().fill(process.env.VIEWER_CODE);
  await a.getByRole('button', { name: '認証' }).click();
  await a.waitForLoadState('networkidle');
  await a.close();

  const p = await ctx.newPage();
  await p.goto(`${BASE}/view/db/${MD_SHEET}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);

  const activeText = async () =>
    await p
      .locator('ul li button[aria-current="true"]')
      .first()
      .innerText()
      .catch(() => null);

  const r = {};
  r.tocCount = await p.locator('ul li button').count();
  r.activeAtTop = await activeText();
  await p.screenshot({ path: `${OUT}/B-10-active-top.png` });

  // 最後の見出しまでスクロールしてアクティブが移るか
  const ids = await p.evaluate(() =>
    Array.from(document.querySelectorAll('h1[id],h2[id],h3[id]')).map((h) => h.id),
  );
  r.headingIds = ids.length;
  const samples = [];
  for (const idx of [1, Math.floor(ids.length / 2), ids.length - 1]) {
    const id = ids[idx];
    if (!id) continue;
    await p.evaluate((i) => document.getElementById(i)?.scrollIntoView({ block: 'start' }), id);
    await p.waitForTimeout(1200);
    samples.push({ scrolledTo: id, active: await activeText() });
  }
  r.samples = samples;
  r.activeChanged = new Set(samples.map((s) => s.active)).size > 1 || samples[0]?.active !== r.activeAtTop;
  await p.screenshot({ path: `${OUT}/B-10-active-bottom.png` });
  report['B-10'] = r;
  await ctx.close();
}

// ---------- C-5: オフラインで失敗した編集が復帰後に再保存されるか ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
  await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
  await p.getByRole('button', { name: /ログイン/ }).click();
  await p.waitForURL(/builder/, { timeout: 30000 });
  await p.waitForTimeout(2000);

  await p.locator('button', { hasText: /^Full \d+$/ }).first().click();
  await p.waitForTimeout(2500);
  const url = p.url();
  const id = new URL(url).searchParams.get('sheet');

  const status = async () => {
    const t = await p.evaluate(() => document.body.innerText);
    for (const s of ['保存済み（自動）', '自動保存に失敗', '保存中', '競合']) if (t.includes(s)) return s;
    return null;
  };
  const inDb = async (marker) => {
    const rows = await sql`select data from blocks where sheet_id = ${id} and type = 'markdown'`;
    return rows.some((x) => JSON.stringify(x.data).includes(marker));
  };

  const r = { sheetId: id };
  const marker = `round9-オフライン編集-${process.env.ROUND_STAMP}`;

  // オフラインにしてから編集 → 自動保存を失敗させる
  await ctx.setOffline(true);
  await p.locator('textarea').first().fill(`## ${marker}\n\nオフライン中の編集。`);
  await p.waitForTimeout(6000);
  r.statusWhileOffline = await status();
  await p.screenshot({ path: `${OUT}/C-5-offline.png` });

  // オンラインへ復帰。追加編集はせずに待つ（これが仕様書の言う「復帰後に再保存」）
  await ctx.setOffline(false);
  await p.waitForTimeout(10000);
  r.statusAfterOnlineNoEdit = await status();
  r.inDbAfterOnlineNoEdit = await inDb(marker);
  await p.screenshot({ path: `${OUT}/C-5-online-no-edit.png` });

  // 手動保存ボタンで救済できるか
  await p.getByRole('button', { name: /^保存$/ }).first().click();
  await p.waitForTimeout(3500);
  r.statusAfterManualSave = await status();
  r.inDbAfterManualSave = await inDb(marker);
  await p.screenshot({ path: `${OUT}/C-5-after-manual-save.png` });

  r.marker = marker;
  report['C-5'] = r;
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/round9-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
