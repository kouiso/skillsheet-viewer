// 18 巡目 D-2 再測定（2 版）。1 版で「stats が画面に 0 件」と出たのは probe の作り方の誤りで、
// アプリの欠落ではなかった。stats は **面ごとに描画のされ方が違う**:
//   - PDF  : `statsBlockToMarkdown()` が表を作る。ラベル行（全ラベル）→ 値行（全 value+unit）
//   - 画面 : `stat-row.tsx` がカードを並べる。1 枚が value → unit → label の順
// 同じ probe を両面に当てると、必ずどちらかが外れる。面ごとに probe を分ける。
//
// profile.meta はどちらの面も「ラベル → 値」の隣接（PDF は `| 年齢 | 28歳 |` の表、
// 画面は `年齢 28歳 · 勤務形態 …` の 1 行）なので共通 probe でよい。
//
// 短い値（`8` `年` `28歳` `高卒`）は単独だと PDF 内の無関係な数字に当たるため、
// 正規化後 8 文字未満の probe はヒット扱いにせず tooShort に落とす（Codex 指摘）。
// 落ちた項目は、それらを含む連結 probe 側で担保する。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

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
const OUT = '<REPO>/test-results/dogfooding/round18';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
const MIN_PROBE = 8;
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
// CJK ハイフン挿入（#146）で `-` が混ざるので、記号と空白を落として比較する。
// `·`(U+00B7) は画面の meta 行の区切り（profile-intro.tsx の `<span aria-hidden>·</span>`）。
// これを落とさないと、複数項目にまたがる連結 probe が画面側だけ必ず外れる。
const norm = (s) => (s ?? '').replace(/[\s\-‐-―ー・·（）()【】[\]、。,.|:*#]/g, '');
const nPdf = norm(pdfText);
const nScreen = norm(screenText);

/** 同一 probe を両面に当てる項目 */
const both = (label, raw) => {
  const probe = norm(raw);
  if (probe.length < MIN_PROBE) return { label, probe, tooShort: true, inPdf: null, inScreen: null };
  return { label, probe, tooShort: false, inPdf: nPdf.includes(probe), inScreen: nScreen.includes(probe) };
};
/** 面ごとに probe が違う項目 */
const perSurface = (label, pdfRaw, screenRaw) => {
  const pdfProbe = norm(pdfRaw);
  const screenProbe = norm(screenRaw);
  const short = pdfProbe.length < MIN_PROBE || screenProbe.length < MIN_PROBE;
  if (short) return { label, pdfProbe, screenProbe, tooShort: true, inPdf: null, inScreen: null };
  return {
    label,
    pdfProbe,
    screenProbe,
    tooShort: false,
    inPdf: nPdf.includes(pdfProbe),
    inScreen: nScreen.includes(screenProbe),
  };
};

const rows = await sql`select type, data from blocks where sheet_id = ${SHEET}`;
const project = rows.find((r) => r.type === 'project')?.data;
const profile = rows.find((r) => r.type === 'profile')?.data;
const stats = rows.find((r) => r.type === 'stats')?.data;

// --- 会社概要文（CompanyInfo.note）。文自体が長いのでそのまま probe にできる ---
const notes = (project?.companies ?? []).filter((c) => (c.note ?? '').trim().length > 0);
const noteResults = notes.map((c) => ({ company: c.name, ...both(`note:${c.name}`, c.note) }));

// --- stats ---
const si = stats?.items ?? [];
const statsResults = [
  // 全枠まとめ: PDF は「ラベル行 → 値行」、画面は「value+unit+label をカード順に連結」
  perSurface(
    'stats:全枠(PDF=ラベル行/値行, 画面=カード連結)',
    si.map((i) => i.label).join('') + si.map((i) => `${i.value}${i.unit}`).join(''),
    si.map((i) => `${i.value}${i.unit}${i.label}`).join(''),
  ),
  // ラベル行・値行それぞれ（PDF 側の表構造の確認）
  both('stats:PDFラベル行(全ラベル連結)', si.map((i) => i.label).join('')),
  both('stats:PDF値行(全 value+unit 連結)', si.map((i) => `${i.value}${i.unit}`).join('')),
];
// 枠ごと: 画面は 1 カードが value+unit+label で一意になる。PDF は表なので隣接する 2 ラベル / 2 値で見る。
for (let i = 0; i < si.length; i += 1) {
  const cur = si[i];
  const next = si[i + 1];
  statsResults.push(
    perSurface(
      `stats:枠[${i}] ${cur.label}`,
      next ? `${cur.label}${next.label}` : si.map((x) => x.label).join(''),
      `${cur.value}${cur.unit}${cur.label}`,
    ),
  );
}

// --- profile ---
const metaEntries = Object.entries(profile?.meta ?? {});
const metaJp = { age: '年齢', work: '勤務形態', station: '最寄り駅', education: '学歴' };
const profileResults = [
  both('profile:name+title', `${profile?.name ?? ''}${profile?.title ?? ''}`),
  both('profile:pr', profile?.pr),
  ...(profile?.strengths ?? []).map((s, i) => both(`profile:strengths[${i}]`, String(s))),
  // meta は両面とも「ラベル → 値」の隣接。全項目連結なら一意。
  both('profile:meta全項目(ラベル+値の連結)', metaEntries.map(([k, v]) => `${metaJp[k] ?? k}${v}`).join('')),
  ...metaEntries.map(([k, v]) => both(`profile:meta.${k}`, `${metaJp[k] ?? k}${v}`)),
];

const tally = (list) => ({
  total: list.length,
  measurable: list.filter((r) => !r.tooShort).length,
  tooShortSkipped: list.filter((r) => r.tooShort).map((r) => r.label),
  inPdf: list.filter((r) => r.inPdf === true).length,
  inScreen: list.filter((r) => r.inScreen === true).length,
  missingInPdf: list.filter((r) => r.inPdf === false).map((r) => r.label),
  missingInScreen: list.filter((r) => r.inScreen === false).map((r) => r.label),
});

const summary = {
  minProbeChars: MIN_PROBE,
  pdfPages: doc.numPages,
  companyNotes: tally(noteResults),
  profile: tally(profileResults),
  stats: tally(statsResults),
};
writeFileSync(`${OUT}/D-2-fields2.json`, JSON.stringify({ summary, noteResults, profileResults, statsResults }, null, 2));
console.log(JSON.stringify(summary, null, 2));
