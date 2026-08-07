// 17 巡目 C-9 追試: 履歴からの復元が「画面だけ」でなく DB まで残るかを見る。
// これまでは履歴ドロワーを開いて復元ダイアログを通したところまでしか記録しておらず、
// restoreProjectData() はローカル state を書き換えるだけなので、保存シリアライズや
// 自動保存の永続化だけが壊れても緑にできる状態やった。
// 本シートを壊さないよう専用シートを作り、終わったらシートごと消す。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';
import { randomUUID } from 'node:crypto';

// .env.local は値に & を含むため shell 経由の export ができない。スクリプト側で読む。
{
  const envPath = '<REPO>/apps/web/.env.local';
  if (existsSync(envPath))
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim();
    }
}

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round17';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const owner = process.env.SKILLSHEET_OWNER_ID;
const stamp = `r17-${Date.now()}`;

const sheetId = randomUUID();
const title = `round17-履歴復元-${stamp}`;
const ORIGINAL = `${stamp}-会社もと`;
// tech / process が無いと isProjectBlockData を通らずブロックごと落ちる（blocks.ts:327-339）。
const emptyTech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
const companies = [{ id: 'co-a', name: ORIGINAL }];
const items = [
  {
    id: 'p1',
    companyId: 'co-a',
    title: `${stamp}-案件1`,
    period: '2024.01〜2024.06',
    scope: '',
    role: '',
    team: '',
    tech: emptyTech,
    process: ['実装'],
    duties: '',
    acquired: '',
    comment: '',
  },
];
await sql`insert into skill_sheets (id, owner_id, title, updated_at) values (${sheetId}, ${owner}, ${title}, now())`;
await sql`insert into blocks (id, sheet_id, type, "order", data)
          values (${randomUUID()}, ${sheetId}, 'project', 0, ${JSON.stringify({ companies, items })}::jsonb)`;

const dbCompanyName = async () => {
  const rows = await sql`select data from blocks where sheet_id = ${sheetId} and type = 'project'`;
  return rows[0]?.data?.companies?.[0]?.name ?? null;
};

const r = { sheetId, original: ORIGINAL };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
const p = await ctx.newPage();

await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await p.getByRole('button', { name: /ログイン/ }).click();
await p.waitForURL(/builder/, { timeout: 30000 });

const openEditor = async () => {
  await p.goto(`${BASE}/builder?sheet=${sheetId}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.getByRole('button', { name: '案件エディタ', exact: true }).click();
  await p.waitForTimeout(1500);
};
const nameField = () => p.getByRole('textbox', { name: '会社名' }).first();
const indicator = () => p.locator('[data-slot="autosave-indicator"]');
const indicatorText = async () => (await indicator().count()) > 0 ? (await indicator().innerText()).replace(/\n+/g, ' ') : null;
// 自動保存の完了を「保存済み」表示で待つ。出ない場合も落とさず、そのときの表示を記録する。
const waitSaved = async (timeout = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await indicatorText();
    if (t && /保存済/.test(t)) return t;
    await p.waitForTimeout(500);
  }
  return await indicatorText();
};

await openEditor();
r.dbAtStart = await dbCompanyName();

// --- 1 回目の編集（履歴に「もと → V1」が積まれる） ---
const V1 = `${stamp}-会社V1`;
await nameField().fill(V1);
r.indicatorAfterEdit1 = await waitSaved();
r.dbAfterEdit1 = await dbCompanyName();

// --- 2 回目の編集。履歴のマージ窓（90 秒）に入らないよう、別のフィールドも触って
//     ラベルが変わるようにしたうえで十分待つ。 ---
const V2 = `${stamp}-会社V2`;
await p.waitForTimeout(1500);
await nameField().fill(V2);
r.indicatorAfterEdit2 = await waitSaved();
r.dbAfterEdit2 = await dbCompanyName();
await p.screenshot({ path: `${OUT}/C-9b-before-restore.png` });

// --- 履歴ドロワーを開いて「この時点に戻す」を押す ---
await p.getByRole('button', { name: /履歴/ }).first().click();
await p.waitForTimeout(1200);
const drawer = p.locator('dialog.hist-drawer');
r.drawerVisible = await drawer.isVisible().catch(() => false);
r.historyEntries = await drawer.locator('.hist-item').count();
r.historyLabels = await drawer.locator('.hist-item .l').allInnerTexts();
await p.screenshot({ path: `${OUT}/C-9b-history-drawer.png` });

// --- 履歴 localStorage の中身を直接見る（snapshot が何を指しているかの確定） ---
r.storageEntries = await p.evaluate((sid) => {
  const raw = localStorage.getItem(`ss_editor_history_v1:${sid}`) ?? localStorage.getItem('ss_editor_history_v1');
  if (!raw) return null;
  try {
    return JSON.parse(raw).map((e) => ({ label: e.label, snapshotCompany: e.snapshot?.companies?.[0]?.name ?? null }));
  } catch (err) {
    return `parse-error: ${String(err)}`;
  }
}, sheetId);


const restoreButtons = drawer.locator('button.hist-restore');
r.restoreButtonCount = await restoreButtons.count();
if (r.restoreButtonCount > 0) {
  r.restoreButtonLabel = (await restoreButtons.first().innerText()).trim();
  await restoreButtons.first().click();
  await p.waitForTimeout(1000);
  r.drawerVisibleAfterClick = await drawer.isVisible().catch(() => false);
  r.valueRightAfterClick = await nameField().inputValue();
  await p.waitForTimeout(6000);
}

// --- ここが今回の主題: 復元が保存まで通るか ---
r.valueAfterRestore = await nameField().inputValue();
r.indicatorAfterRestore = await waitSaved();
r.dbAfterRestore = await dbCompanyName();
await p.screenshot({ path: `${OUT}/C-9b-after-restore.png` });

// --- リロード後も残るか（画面と DB の両方） ---
await openEditor();
r.valueAfterReload = await nameField().inputValue();
r.dbAfterReload = await dbCompanyName();
await p.screenshot({ path: `${OUT}/C-9b-after-reload.png` });

r.restoredToPreviousValue = r.dbAfterRestore === V1;
r.persistedAfterReload = r.dbAfterReload === r.dbAfterRestore && r.valueAfterReload === r.dbAfterReload;
r.values = { V1, V2 };

await ctx.close();
await b.close();

await sql`delete from blocks where sheet_id = ${sheetId}`;
await sql`delete from skill_sheets where id = ${sheetId}`;
r.cleanedUp = (await sql`select id from skill_sheets where id = ${sheetId}`).length === 0;

writeFileSync(`${OUT}/C-9-persist2.json`, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r, null, 2));
