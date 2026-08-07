// 4 巡目: Codex レビュー（4a18a9c）で指摘された未実測サブステップを実際に動かす。
// - C-2  ブロック追加が保存 → リロードで残るか
// - B-11 技術フィルタ 0 件時の表示
// - E-1  /login /viewer-auth /view/[path] を 4VP × 2テーマで撮影
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round4';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VIEWPORTS = [
  ['sp-narrow', 320, 800],
  ['sp', 375, 812],
  ['tablet', 768, 1024],
  ['desktop', 1280, 800],
];

mkdirSync(OUT, { recursive: true });
const report = {};
const browser = await chromium.launch({ executablePath: EXE });

const viewerAuth = async (ctx) => {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
  await p.locator('input').first().fill(process.env.VIEWER_CODE);
  await p.getByRole('button', { name: '認証' }).click();
  await p.waitForLoadState('networkidle');
  await p.close();
};

const editorLogin = async (ctx) => {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
  await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
  await p.getByRole('button', { name: /ログイン/ }).click();
  await p.waitForURL(/builder/, { timeout: 30000 });
  await p.close();
};

// ---------- C-2: ブロック追加の永続化 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await editorLogin(ctx);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);

  const countBlocks = async () => await p.locator('[data-block-id], .sortable-block').count();
  const before = await p.evaluate(() => document.body.innerText.length);

  // 「ブロック」タブに切り替えて 4 種のボタンを押す
  const tab = p.getByRole('button', { name: 'ブロック', exact: true });
  if (await tab.count()) await tab.first().click();
  await p.waitForTimeout(500);

  const added = [];
  for (const label of ['テキスト', 'テーブル', 'スキル一覧', '職務経歴']) {
    const btn = p.getByRole('button', { name: label, exact: true });
    if (await btn.count()) {
      await btn.first().click();
      await p.waitForTimeout(400);
      added.push(label);
    }
  }
  const afterAdd = await p.evaluate(() => document.body.innerText.length);

  // 保存
  const save = p.getByRole('button', { name: /^保存/ });
  let saved = false;
  if (await save.count()) {
    await save.first().click();
    await p.waitForTimeout(2500);
    saved = true;
  }
  const savedText = await p.evaluate(() => document.body.innerText.slice(0, 400));

  // リロードして残っているか
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  const afterReload = await p.evaluate(() => document.body.innerText.length);
  await p.screenshot({ path: `${OUT}/C-2-after-reload.png`, fullPage: false });

  report['C-2'] = { added, saved, before, afterAdd, afterReload, savedText, blocks: await countBlocks() };
  await ctx.close();
}

// ---------- B-11: 技術フィルタ 0 件時の表示 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await viewerAuth(ctx);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);

  const search = p.locator('input[placeholder="案件・技術・役割を検索…"]');
  const hasSearch = await search.count();
  const counterBefore = await p.locator('text=/\\d+ \\/ \\d+ 件/').first().innerText().catch(() => null);

  // 1) 検索だけで 0 件にする
  await search.first().fill('zzzz-該当なし-zzzz');
  await p.waitForTimeout(900);
  const emptyMsg = await p
    .locator('text=条件に一致する案件がありません')
    .first()
    .innerText()
    .catch(() => null);
  const counterZero = await p.locator('text=/\\d+ \\/ \\d+ 件/').first().innerText().catch(() => null);
  await p.screenshot({ path: `${OUT}/B-11-zero-query.png` });

  // 2) 技術チップ + 一致しない検索語の組み合わせ
  await search.first().fill('');
  await p.waitForTimeout(500);
  const chip = p.locator('button[aria-pressed]').first();
  const chipName = await chip.innerText().catch(() => null);
  await chip.click();
  await p.waitForTimeout(700);
  const counterChip = await p.locator('text=/\\d+ \\/ \\d+ 件/').first().innerText().catch(() => null);
  await search.first().fill('zzzz-該当なし-zzzz');
  await p.waitForTimeout(900);
  const counterBoth = await p.locator('text=/\\d+ \\/ \\d+ 件/').first().innerText().catch(() => null);
  const emptyMsg2 = await p
    .locator('text=条件に一致する案件がありません')
    .first()
    .innerText()
    .catch(() => null);
  await p.screenshot({ path: `${OUT}/B-11-zero-chip-plus-query.png` });

  // クリアで戻るか
  const clear = p.getByRole('button', { name: 'クリア' });
  const hadClear = await clear.count();
  if (hadClear) {
    await clear.first().click();
    await p.waitForTimeout(800);
  }
  const counterAfterClear = await p.locator('text=/\\d+ \\/ \\d+ 件/').first().innerText().catch(() => null);

  report['B-11'] = {
    hasSearch,
    counterBefore,
    counterZero,
    emptyMsg,
    chipName,
    counterChip,
    counterBoth,
    emptyMsg2,
    hadClear,
    counterAfterClear,
  };
  await ctx.close();
}

// ---------- E-1: 未撮影ルート ----------
{
  const routes = [
    ['login', `${BASE}/login`, false],
    ['viewer-auth', `${BASE}/viewer-auth`, false],
    ['view-path', `${BASE}/view/skillsheet.md`, true],
  ];
  const e1 = {};
  for (const [name, url, needViewer] of routes) {
    for (const [vpName, w, h] of VIEWPORTS) {
      for (const theme of ['light', 'dark']) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
        if (needViewer) await viewerAuth(ctx);
        const p = await ctx.newPage();
        const errors = [];
        p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
        const resp = await p.goto(url, { waitUntil: 'networkidle' }).catch(() => null);
        await p.waitForTimeout(600);
        const overflow = await p.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        const text = await p.evaluate(() => document.body.innerText.slice(0, 500));
        await p.screenshot({ path: `${OUT}/E-1-${name}-${vpName}-${theme}.png` });
        e1[`${name}-${vpName}-${theme}`] = {
          status: resp?.status() ?? null,
          finalUrl: p.url(),
          overflow,
          horizontalScroll: overflow.scrollWidth > overflow.clientWidth,
          consoleErrors: errors,
          text,
        };
        await ctx.close();
      }
    }
  }
  report['E-1-extra'] = e1;
}

await browser.close();
writeFileSync(`${OUT}/round4-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ 'C-2': report['C-2'], 'B-11': report['B-11'] }, null, 2));
