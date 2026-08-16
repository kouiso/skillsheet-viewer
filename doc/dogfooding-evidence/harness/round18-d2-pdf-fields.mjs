// 18 巡目 D-2 再測定。17 巡目までの測り方には 2 つ欠陥があった（Codex 指摘）。
//
//   1. probe が `slice(0, 6)` だったため、`I・K` `8` `年` `4` `名` `20代` のような短い値は
//      probe が値そのものになり、PDF 内の無関係な日付・人数・年齢に当たって
//      「出ている」と誤判定できた。stats を label / value / unit で別々に見ていたのも同じ穴。
//   2. 検証用シート自体に過去の巡の書き込み（C-5 の社名 / C-13 の自己PR / C-7 の工程・技術タグ /
//      C-3 の並べ替え）が残っていた。
//
// 2 は検証用ブランチのブロックを親（本番・未書き込み）と md5 一致するまで戻して解消済み。
// このスクリプトは 1 を直す。**隣接して描画される値を連結した複合 probe** で見る。
//   - stats: 表のラベル行（全ラベル連結）と値行（全 value+unit 連結）
//   - profile.meta: `| 年齢 | 20代 |` 行なので `年齢20代` の隣接
//   - name/title: `# I・K` の直後に `**<title>**` が来るので連結
// 正規化後 8 文字未満の probe は「短すぎて一意でない」として **ヒット扱いにせず tooShort に落とす**。
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
const norm = (s) => (s ?? '').replace(/[\s\-‐-―ー・（）()【】[\]、。,.|:*#]/g, '');
const nPdf = norm(pdfText);
const nScreen = norm(screenText);

// probe は「値そのもの」を使う。短すぎるものはヒットにせず tooShort に落とす。
const check = (label, raw) => {
  const probe = norm(raw);
  if (probe.length < MIN_PROBE) return { label, probe, tooShort: true, inPdf: null, inScreen: null };
  return { label, probe, tooShort: false, inPdf: nPdf.includes(probe), inScreen: nScreen.includes(probe) };
};

const rows = await sql`select type, data from blocks where sheet_id = ${SHEET}`;
const project = rows.find((r) => r.type === 'project')?.data;
const profile = rows.find((r) => r.type === 'profile')?.data;
const stats = rows.find((r) => r.type === 'stats')?.data;

// --- 会社概要文（CompanyInfo.note）: それ自体が長いのでそのまま probe にできる ---
const notes = (project?.companies ?? []).filter((c) => (c.note ?? '').trim().length > 0);
const noteResults = notes.map((c) => ({ company: c.name, ...check(`note:${c.name}`, c.note) }));

// --- stats: 表として描画されるので「全ラベル連結」「全 value+unit 連結」の 2 本で見る ---
const statsItems = stats?.items ?? [];
const statsResults = [
  check('stats:labels(表ヘッダー行の全ラベル連結)', statsItems.map((i) => i.label).join('')),
  check('stats:values(表の値行の全 value+unit 連結)', statsItems.map((i) => `${i.value}${i.unit}`).join('')),
];
// 各カードの value+unit+label は単独では短いので、隣接 2 枠を連結して一意にする。
for (let i = 0; i < statsItems.length; i += 1) {
  const cur = statsItems[i];
  const next = statsItems[(i + 1) % statsItems.length];
  statsResults.push(check(`stats:label隣接[${i}]`, `${cur.label}${next.label}`));
  statsResults.push(check(`stats:value隣接[${i}]`, `${cur.value}${cur.unit}${next.value}${next.unit}`));
}

// --- profile: markdown の並びに合わせた隣接連結 ---
const profileResults = [
  check('profile:name+title(# 見出しの直後に **title**)', `${profile?.name ?? ''}${profile?.title ?? ''}`),
  check('profile:pr', profile?.pr),
  ...(profile?.strengths ?? []).map((s, i) => check(`profile:strengths[${i}]`, String(s))),
  // meta は `| 年齢 | 20代 |` の行なのでラベルと値を隣接させる
  ...Object.entries(profile?.meta ?? {}).map(([k, v]) => {
    const jp = { age: '年齢', work: '勤務形態', station: '最寄り駅', education: '学歴' }[k] ?? k;
    return check(`profile:meta.${k}(${jp}+値)`, `${jp}${v}`);
  }),
];

const tally = (list) => ({
  total: list.length,
  measurable: list.filter((r) => !r.tooShort).length,
  tooShort: list.filter((r) => r.tooShort).map((r) => r.label),
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
writeFileSync(`${OUT}/D-2-fields.json`, JSON.stringify({ summary, noteResults, profileResults, statsResults }, null, 2));
console.log(JSON.stringify(summary, null, 2));
