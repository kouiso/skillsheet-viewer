// 14 巡目 D-3 追試: PDF の「表・カードがページ境界で切れていないか」を分けて測る。
// 既存の記録は見出しと本体の分断（P-2）しか見ていなかった。
// 判定: 案件カードのタイトル（h3 相当のテキスト）が出たページと、そのカードの構成要素
//（期間・役割・技術タグ・工程ラベル）が出たページを比べ、またいでいる件数を数える。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round14';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
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
const file = await dl;
const pdfPath = `${OUT}/D-3.pdf`;
await file.saveAs(pdfPath);
await ctx.close();
await browser.close();

// --- PDF をページ単位でテキスト抽出する ---
const pdfjs = await import(
  '<SCRATCH>/pdftool/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i += 1) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  pages.push(tc.items.map((it) => it.str).join(''));
}

const rows = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'project'`;
const data = rows[0].data;
const hiddenCo = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
const items = data.items.filter((i) => !i.hidden && !hiddenCo.has(i.companyId));

// PDF は CJK ハイフン挿入（#146）でタイトルに `-` が混ざることがあるので、
// 比較用に記号を落とした正規化文字列で探す。
const norm = (s) => (s ?? '').replace(/[\s\-‐-―ー・（）()【】\[\]]/g, '');
const normPages = pages.map(norm);
const findPages = (needle) => {
  const n = norm(needle);
  if (!n) return [];
  return normPages.map((t, i) => (t.includes(n) ? i + 1 : 0)).filter(Boolean);
};

const report = { numPages: doc.numPages, projects: items.length, cardsSplit: [], notFound: [] };
for (const it of items) {
  const titlePages = findPages(it.title);
  if (titlePages.length === 0) {
    report.notFound.push(it.title);
    continue;
  }
  const anchor = titlePages[0];
  // カードを構成する要素それぞれがどのページに出たか
  const parts = {
    period: findPages(it.period),
    role: findPages(it.role),
    scope: findPages(it.scope),
    team: it.team ? findPages(`${it.team}名`) : [],
    tech: findPages((it.tech?.lang ?? [])[0] ?? ''),
  };
  const spread = new Set([anchor]);
  for (const v of Object.values(parts)) for (const q of v) if (Math.abs(q - anchor) <= 1) spread.add(q);
  if (spread.size > 1) {
    report.cardsSplit.push({ title: it.title, titlePage: anchor, partPages: parts, spread: [...spread].sort() });
  }
}

// 表（スキル表）がページをまたいでいないか: カテゴリ見出しとその配下スキルのページを比べる
const skillRows = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'skills' order by "order"`;
report.skillTables = skillRows.map((row) => {
  const d = row.data;
  const catPages = findPages(d.category);
  const namePages = [...new Set((d.skills ?? []).flatMap((s) => findPages(s.name)))].sort((x, y) => x - y);
  return {
    category: d.category,
    categoryPages: catPages,
    skillPagesSpan: namePages.length ? [namePages[0], namePages[namePages.length - 1]] : [],
    spansMultiplePages: namePages.length > 0 && namePages[0] !== namePages[namePages.length - 1],
  };
});

writeFileSync(`${OUT}/D-3-pdf.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      numPages: report.numPages,
      projects: report.projects,
      cardsSplitCount: report.cardsSplit.length,
      cardsSplitTitles: report.cardsSplit.map((c) => c.title).slice(0, 8),
      notFound: report.notFound,
      tablesSpanning: report.skillTables.filter((t) => t.spansMultiplePages).map((t) => t.category),
      tables: report.skillTables.map((t) => `${t.category}: cat=${t.categoryPages} skills=${t.skillPagesSpan}`),
    },
    null,
    2,
  ),
);
