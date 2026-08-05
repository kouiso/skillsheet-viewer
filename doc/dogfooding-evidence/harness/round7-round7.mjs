// 7 巡目: D-2 を「元データ・正本 DB・画面・PDF」の 4 点で突合し直す。
// これまでの D-2 は画面 ↔ PDF しか見ておらず、正本 DB の全件比較を省いていた。
// 前提として、過去の巡で立てた hidden フラグを全て戻してから測る（件数を素の状態に揃える）。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round7';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
const SRC = '<SKILL_SHEET_REPO>/skillsheet.md';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const report = {};

// 1. hidden の復元は前回実行済み（hidden=0）。ここでは現状を記録するだけ。
{
  const [row] = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'project'`;
  report.restore = {
    hiddenCompanies: row.data.companies.filter((c) => c.hidden).length,
    hiddenItems: row.data.items.filter((i) => i.hidden).length,
    companies: row.data.companies.length,
    items: row.data.items.length,
  };
}

// ---------- 2. 元データ / 正本 DB を数える ----------
const srcText = readFileSync(SRC, 'utf8');
const srcCompanySections = [...srcText.matchAll(/^### ◆/gm)].length;
const srcProjectTitles = [...srcText.matchAll(/^#### ■ \d+\.\s*(.+?)\s*$/gm)].map((m) => m[1]);

const [pb] = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'project'`;
const dbCompanies = pb.data.companies.map((c) => c.name);
const dbItems = pb.data.items.map((i) => i.title);
const skillRows = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'skills'`;
const dbSkills = skillRows.flatMap((r) => r.data.skills.map((s) => s.name));

report.counts = {
  src: { companySections: srcCompanySections, projectTitles: srcProjectTitles.length },
  db: { companies: dbCompanies.length, items: dbItems.length, skills: dbSkills.length },
};

// ---------- 3. 画面と PDF を取る ----------
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });

const auth = await ctx.newPage();
await auth.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await auth.locator('input').first().fill(process.env.VIEWER_CODE);
await auth.getByRole('button', { name: '認証' }).click();
await auth.waitForLoadState('networkidle');
await auth.close();

const v = await ctx.newPage();
await v.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
await v.waitForTimeout(2500);
const screenText = await v.evaluate(() => document.body.innerText);
writeFileSync(`${OUT}/D-2-screen.txt`, screenText);
report.screenCounter = (screenText.match(/(\d+) \/ (\d+) 件/) ?? [null])[0];

const dl = v.waitForEvent('download', { timeout: 180000 });
await v.locator('[aria-label="PDFダウンロード"]').click();
const file = await dl;
const pdfPath = `${OUT}/D-2-full.pdf`;
await file.saveAs(pdfPath);

const pdfjs = await import(
  '<SCRATCH>/pdftool/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)) }).promise;
let pdfText = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  pdfText += (await page.getTextContent()).items.map((x) => x.str).join('');
}
writeFileSync(`${OUT}/D-2-pdf.txt`, pdfText);
report.pdfPages = doc.numPages;

// ---------- 4. 4 点突合 ----------
// PDF/画面のテキストは装飾で分断されうるので、空白を潰してから包含判定する。
const squash = (s) => s.replace(/\s+/g, '');
const sqScreen = squash(screenText);
const sqPdf = squash(pdfText);

const cmp = (names) =>
  names.map((n) => ({ name: n, inScreen: sqScreen.includes(squash(n)), inPdf: sqPdf.includes(squash(n)) }));

const itemCmp = cmp(dbItems);
const skillCmp = cmp(dbSkills);
const companyCmp = cmp(dbCompanies);

report.reconcile = {
  items: {
    db: dbItems.length,
    inScreen: itemCmp.filter((x) => x.inScreen).length,
    inPdf: itemCmp.filter((x) => x.inPdf).length,
    missingFromScreen: itemCmp.filter((x) => !x.inScreen).map((x) => x.name),
    missingFromPdf: itemCmp.filter((x) => !x.inPdf).map((x) => x.name),
  },
  skills: {
    db: dbSkills.length,
    inScreen: skillCmp.filter((x) => x.inScreen).length,
    inPdf: skillCmp.filter((x) => x.inPdf).length,
    missingFromScreen: skillCmp.filter((x) => !x.inScreen).map((x) => x.name),
    missingFromPdf: skillCmp.filter((x) => !x.inPdf).map((x) => x.name),
  },
  companies: {
    db: dbCompanies.length,
    inScreen: companyCmp.filter((x) => x.inScreen).length,
    inPdf: companyCmp.filter((x) => x.inPdf).length,
    missingFromPdf: companyCmp.filter((x) => !x.inPdf).map((x) => x.name),
  },
};

// 元データ側にあって DB に無いスキル（既知の D-1 欠落を数え直す）
const srcSkillNames = [...srcText.matchAll(/^\|[^|]*\|\s*([^|]+?)\s*\|\s*\d+\s*年/gm)].map((m) => m[1].trim());
report.reconcile.srcSkills = {
  countedInSource: srcSkillNames.length,
  missingFromDb: srcSkillNames.filter((n) => !dbSkills.includes(n)),
};
report.reconcile.srcItems = {
  countedInSource: srcProjectTitles.length,
  missingFromDb: srcProjectTitles.filter((t) => !dbItems.includes(t)),
};

await ctx.close();
await browser.close();
writeFileSync(`${OUT}/round7-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
