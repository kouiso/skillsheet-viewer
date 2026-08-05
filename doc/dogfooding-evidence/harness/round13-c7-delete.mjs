// 13 巡目 C-7 追試: 案件エディタの「削除」経路（会社削除 / 案件削除）を実際に押す。
// 本シートを壊さないよう、専用シートを新規作成してその中で操作し、終わったらシートごと消す。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';
import { randomUUID } from 'node:crypto';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round13';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const owner = process.env.SKILLSHEET_OWNER_ID;
const stamp = process.env.ROUND_STAMP;

// 会社 2 社 / 案件 3 件を持つ検証専用シートを直接投入する。
const sheetId = randomUUID();
const title = `round13-削除経路-${stamp}`;
const companies = [
  { id: 'co-a', name: `${stamp}-会社A` },
  { id: 'co-b', name: `${stamp}-会社B` },
];
// tech / process が無いと isProjectBlockData を通らずブロックごと落ちる（blocks.ts:327-339）。
const emptyTech = { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
const mkItem = (id, companyId, title, period) => ({
  id,
  companyId,
  title,
  period,
  scope: '',
  role: '',
  team: '',
  tech: emptyTech,
  process: ['実装'],
  duties: '',
  acquired: '',
  comment: '',
});
const items = [
  mkItem('p1', 'co-a', `${stamp}-案件1`, '2024.01〜2024.06'),
  mkItem('p2', 'co-a', `${stamp}-案件2`, '2024.07〜2024.12'),
  mkItem('p3', 'co-b', `${stamp}-案件3`, '2025.01〜現在'),
];
await sql`insert into skill_sheets (id, owner_id, title, updated_at) values (${sheetId}, ${owner}, ${title}, now())`;
await sql`insert into blocks (id, sheet_id, type, "order", data)
          values (${randomUUID()}, ${sheetId}, 'project', 0, ${JSON.stringify({ companies, items })}::jsonb)`;

const readDb = async () => {
  const rows = await sql`select data from blocks where sheet_id = ${sheetId} and type = 'project'`;
  const d = rows[0]?.data ?? { companies: [], items: [] };
  return { companies: d.companies.map((c) => c.name), items: d.items.map((i) => i.title) };
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
const p = await ctx.newPage();
// confirm は差し替えず、実際のダイアログを受理して確認ダイアログの有無まで見る。
const dialogs = [];
p.on('dialog', async (d) => {
  dialogs.push(d.message());
  await d.accept();
});

await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await p.getByRole('button', { name: /ログイン/ }).click();
await p.waitForURL(/builder/, { timeout: 30000 });
await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
// シート一覧から検証専用シートを選び、案件エディタタブへ入る。
await p.getByRole('button', { name: title, exact: true }).first().click();
await p.waitForTimeout(2500);
await p.getByRole('button', { name: '案件エディタ', exact: true }).click();
await p.waitForTimeout(2000);

// 削除ボタンは必ず案件ナビ（aside.col-list）内に限定する。
// シート一覧側の「「<タイトル>」を削除」を掴むと本シートを消しかねない。
const nav = p.locator('aside.col-list');
const companyDel = nav.locator('[title="会社を削除"]');
const projectDel = nav.locator('[aria-label="案件を削除"]');

const r = { sheetId, dbBefore: await readDb() };
r.navCompaniesBefore = await companyDel.count();
r.navProjectsBefore = await projectDel.count();
await p.screenshot({ path: `${OUT}/C-7-before.png` });

// --- 案件削除 ---
await projectDel.first().click();
await p.waitForTimeout(4000);
r.dialogAfterProjectDelete = dialogs.at(-1) ?? null;
r.navProjectsAfterProjectDelete = await projectDel.count();
r.dbAfterProjectDelete = await readDb();
await p.screenshot({ path: `${OUT}/C-7-after-project-delete.png` });

// --- 会社削除（配下の案件ごと消えるか） ---
await nav.locator(`[aria-label="${stamp}-会社A を削除"]`).first().click();
await p.waitForTimeout(4000);
r.dialogAfterCompanyDelete = dialogs.at(-1) ?? null;
r.navCompaniesAfterCompanyDelete = await companyDel.count();
r.navProjectsAfterCompanyDelete = await projectDel.count();
r.dbAfterCompanyDelete = await readDb();
await p.screenshot({ path: `${OUT}/C-7-after-company-delete.png` });

// --- リロードして保存後の状態が残っているか ---
await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.getByRole('button', { name: title, exact: true }).first().click();
await p.waitForTimeout(2500);
await p.getByRole('button', { name: '案件エディタ', exact: true }).click();
await p.waitForTimeout(2000);
r.navCompaniesAfterReload = await nav.locator('[title="会社を削除"]').count();
r.navProjectsAfterReload = await nav.locator('[aria-label="案件を削除"]').count();
r.dbAfterReload = await readDb();
await p.screenshot({ path: `${OUT}/C-7-after-reload.png` });
r.dialogs = dialogs;

await ctx.close();
await b.close();

// 後片付け
await sql`delete from blocks where sheet_id = ${sheetId}`;
await sql`delete from skill_sheets where id = ${sheetId}`;
r.cleanedUp = (await sql`select id from skill_sheets where id = ${sheetId}`).length === 0;

writeFileSync(`${OUT}/C-7-delete.json`, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r, null, 2));
