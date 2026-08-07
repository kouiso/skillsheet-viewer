// 16 巡目 D-2 追試: PDF に会社概要文（CompanyInfo.note）と profile / stats が出ているかを
// 実際に抽出テキストで数える。これまでは会社・案件・スキルの件数しか記録していなかった。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round16';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
const a = await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button', { name: '認証' }).click();
await a.waitForLoadState('networkidle');
await a.close();

const p = await ctx.newPage();
await p.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
const dl = p.waitForEvent('download', { timeout: 240000 });
await p.locator('[aria-label="PDFダウンロード"]').click();
const pdfPath = `${OUT}/D-2.pdf`;
await (await dl).saveAs(pdfPath);
// 画面側にも出ているかを同時に採る（PDF だけ落ちているのか、画面もかを分けるため）
const screenText = await p.evaluate(() => document.body.innerText);
await ctx.close();
await b.close();

const pdfjs = await import(
  '<SCRATCH>/pdftool/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;
let pdfText = '';
for (let i = 1; i <= doc.numPages; i += 1) {
  const tc = await (await doc.getPage(i)).getTextContent();
  pdfText += tc.items.map((x) => x.str).join('');
}
// CJK ハイフン挿入（#146）で `-` が混ざるので、記号を落として比較する
const norm = (s) => (s ?? '').replace(/[\s\-‐-―ー・（）()【】[\]、。,.]/g, '');
const nPdf = norm(pdfText);
const nScreen = norm(screenText);

const rows = await sql`select type, data from blocks where sheet_id = ${SHEET}`;
const project = rows.find((r) => r.type === 'project')?.data;
const profile = rows.find((r) => r.type === 'profile')?.data;
const stats = rows.find((r) => r.type === 'stats')?.data;

const hit = (v) => {
  const n = norm(v);
  // 短すぎる語は誤ヒットするので 6 文字以上の先頭断片で見る
  const probe = n.slice(0, Math.max(6, Math.min(24, n.length)));
  return { probe, inPdf: probe.length > 0 && nPdf.includes(probe), inScreen: probe.length > 0 && nScreen.includes(probe) };
};

const notes = (project?.companies ?? []).filter((c) => (c.note ?? '').trim().length > 0);
const noteResults = notes.map((c) => ({ company: c.name, ...hit(c.note) }));

const profileFields = [
  ['name', profile?.name],
  ['title', profile?.title],
  ['pr', profile?.pr],
  ...Object.entries(profile?.meta ?? {}).map(([k, v]) => [`meta.${k}`, String(v)]),
  ...(profile?.strengths ?? []).map((s, i) => [`strengths[${i}]`, typeof s === 'string' ? s : JSON.stringify(s)]),
];
const profileResults = profileFields
  .filter(([, v]) => (v ?? '').toString().trim().length > 0)
  .map(([k, v]) => ({ field: k, ...hit(String(v)) }));

// stats はキー順に連結すると表示順と違って必ず外れるので、フィールド単位で見る。
const statsResults = (stats?.items ?? []).flatMap((it, i) =>
  ['label', 'value', 'unit']
    .filter((k) => (it[k] ?? '').toString().trim().length > 0)
    .map((k) => ({ field: `items[${i}].${k}`, raw: String(it[k]), ...hit(String(it[k])) })),
);

const summary = {
  pdfPages: doc.numPages,
  companyNotes: { total: notes.length, inPdf: noteResults.filter((r) => r.inPdf).length, inScreen: noteResults.filter((r) => r.inScreen).length },
  profile: { total: profileResults.length, inPdf: profileResults.filter((r) => r.inPdf).length, inScreen: profileResults.filter((r) => r.inScreen).length },
  stats: { total: statsResults.length, inPdf: statsResults.filter((r) => r.inPdf).length, inScreen: statsResults.filter((r) => r.inScreen).length },
  profileMissingInPdf: profileResults.filter((r) => !r.inPdf).map((r) => r.field),
  statsMissingInPdf: statsResults.filter((r) => !r.inPdf).map((r) => r.field),
};
writeFileSync(`${OUT}/D-2-fields.json`, JSON.stringify({ summary, noteResults, profileResults, statsResults }, null, 2));
console.log(JSON.stringify(summary, null, 2));
