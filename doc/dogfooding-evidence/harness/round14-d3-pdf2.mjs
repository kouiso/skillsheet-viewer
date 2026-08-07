// D-3 再測定。前の測り方は「文字列がどのページに出るか」で見ており、
// "React" のような語が他カードの技術タグにも出るため誤検出だらけやった。
// ここでは PDF のテキストを**描画順の 1 本の並び**にして、
// 「あるカードのタイトル位置から次のカードのタイトル位置まで」が何ページにまたがるかで判定する。
import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const OUT = '<REPO>/test-results/dogfooding/round14';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
const sql = neon(process.env.DATABASE_URL);

const pdfjs = await import(
  '<SCRATCH>/pdftool/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`${OUT}/D-3.pdf`)), useSystemFonts: true })
  .promise;

// 描画順のフラット列（page 番号つき）
const seq = [];
for (let i = 1; i <= doc.numPages; i += 1) {
  const tc = await (await doc.getPage(i)).getTextContent();
  for (const it of tc.items) if (it.str.trim()) seq.push({ page: i, s: it.str });
}
// 連結文字列と、各文字がどの item 由来かの索引を作る
const norm = (s) => s.replace(/[\s\-‐-―ー・（）()【】[\]]/g, '');
let flat = '';
const owner = [];
for (let k = 0; k < seq.length; k += 1) {
  const n = norm(seq[k].s);
  flat += n;
  for (let c = 0; c < n.length; c += 1) owner.push(k);
}

const rows = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'project'`;
const data = rows[0].data;
const hiddenCo = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
const items = data.items.filter((i) => !i.hidden && !hiddenCo.has(i.companyId));

// タイトルを描画順に沿って前から順に拾う（同じ語が後で再出現しても取り違えない）
let cursor = 0;
const anchors = [];
for (const it of items) {
  const needle = norm(it.title);
  const at = flat.indexOf(needle, cursor);
  if (at < 0) {
    anchors.push({ title: it.title, found: false });
    continue;
  }
  anchors.push({ title: it.title, found: true, start: at, itemIndex: owner[at] });
  cursor = at + needle.length;
}

const report = { numPages: doc.numPages, projects: items.length, notFound: [], split: [] };
for (let i = 0; i < anchors.length; i += 1) {
  const cur = anchors[i];
  if (!cur.found) {
    report.notFound.push(cur.title);
    continue;
  }
  const next = anchors.slice(i + 1).find((a) => a.found);
  const from = cur.itemIndex;
  const to = next ? next.itemIndex : seq.length;
  const pagesUsed = [...new Set(seq.slice(from, to).map((x) => x.page))].sort((a, b) => a - b);
  if (pagesUsed.length > 1) report.split.push({ title: cur.title, pages: pagesUsed });
}

// スキル表: カテゴリ見出しから次のカテゴリ見出しまでが何ページにまたがるか
const skillRows = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'skills' order by "order"`;
let c2 = 0;
const catAnchors = [];
for (const row of skillRows) {
  const needle = norm(row.data.category);
  const at = flat.indexOf(needle, c2);
  catAnchors.push({ category: row.data.category, at, itemIndex: at >= 0 ? owner[at] : -1 });
  if (at >= 0) c2 = at + needle.length;
}
report.skillTables = catAnchors.map((c, i) => {
  if (c.itemIndex < 0) return { category: c.category, found: false };
  const next = catAnchors.slice(i + 1).find((x) => x.itemIndex >= 0);
  const pagesUsed = [
    ...new Set(seq.slice(c.itemIndex, next ? next.itemIndex : c.itemIndex + 60).map((x) => x.page)),
  ].sort((a, b) => a - b);
  return { category: c.category, pages: pagesUsed, split: pagesUsed.length > 1 };
});

writeFileSync(`${OUT}/D-3-pdf2.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      numPages: report.numPages,
      projects: report.projects,
      notFound: report.notFound,
      cardsSplit: report.split.length,
      cardsSplitDetail: report.split.slice(0, 10),
      skillTables: report.skillTables,
    },
    null,
    2,
  ),
);
