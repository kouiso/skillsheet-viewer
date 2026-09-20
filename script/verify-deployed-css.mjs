#!/usr/bin/env node
/**
 * デプロイ済み CSS が app/globals.css のデザイントークンと一致するか検査するスモーク。
 *
 * 背景: Turbopack 永続ビルドキャッシュを cross-build で復元した際、ソース変更を
 * 反映しない古いコンパイル済み CSS が本番に配信された（#361）。
 * next.config.ts で turbopackFileSystemCacheForBuild を無効化済みだが、同種の
 * 「新 JS + 旧 CSS」混在（ビルドキャッシュ・CDN 問わず）を検知するため残す。
 *
 * 使い方:
 *   node script/verify-deployed-css.mjs [baseUrl]
 *   DEPLOYED_BASE_URL=https://... node script/verify-deployed-css.mjs
 *
 * 手順:
 *   1. 認証不要の公開ページ (/viewer-auth) の HTML から /_next/static 配下の
 *      .css リンクを収集する
 *   2. 全 CSS を取得して正規化（空白除去・短縮 hex 展開・小文字化）して結合
 *   3. globals.css の `:root` / `.dark` ブロック内の `--name: value` 宣言を
 *      同じ正規化で `--name:value` 化し、結合 CSS に含まれるか全件照合する
 *      （@theme の var() 参照はツリーシェイクで出力に残らない場合があるため対象外）
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = (process.argv[2] ?? process.env.DEPLOYED_BASE_URL ?? 'https://skill-sheet-snowy.vercel.app').replace(
  /\/+$/,
  '',
);
const PAGE_PATH = '/viewer-auth';
const TIMEOUT_MS = 20_000;

/** minifier の表記揺れ（空白・hex 短縮・rgba→hex・0. 省略・大小文字）を吸収する正規化 */
function normalizeCss(text) {
  return (
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .toLowerCase()
      // lightningcss は rgba(r,g,b,a) を #rrggbbaa へ畳むため hex へ正規化して合わせる
      .replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+%?)\s*)?\)/g, (_m, r, g, b, a) => {
        const hex = (n) => Number(n).toString(16).padStart(2, '0');
        const alpha =
          a === undefined ? '' : hex(Math.round((a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a)) * 255));
        return `#${hex(r)}${hex(g)}${hex(b)}${alpha}`;
      })
      // 短縮 hex (#abc / #abcd) は長い形式へ展開する
      .replace(
        /#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?\b/g,
        (_m, r, g, b, a) => `#${r}${r}${g}${g}${b}${b}${a ? a + a : ''}`,
      )
      .replace(/\b0\./g, '.')
      .replace(/\s+/g, '')
  );
}

/** globals.css の `:root` / `.dark` ブロックから `--name:value`（正規化済み）を抽出 */
function extractSentinelDecls(cssText) {
  const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = new Set();
  for (const block of cleaned.matchAll(/(?:^|\})\s*(:root|\.dark)\s*\{([^}]*)\}/g)) {
    for (const decl of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      decls.add(normalizeCss(`${decl[1]}:${decl[2]}`));
    }
  }
  return decls;
}

async function fetchText(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: { 'cache-control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

const sourceCss = readFileSync(join(repoRoot, 'app/globals.css'), 'utf8');
const expected = extractSentinelDecls(sourceCss);
if (expected.size === 0) {
  console.error('globals.css からセンチネルトークンを抽出できませんでした');
  process.exit(1);
}

// デプロイ直後は CDN の伝播ラグで旧 HTML/CSS が返りうるため、欠落時は数回待って
// 再試行し、伝播中の誤検知（false negative）を防ぐ。
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 15_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let missing = [];
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const html = await fetchText(`${baseUrl}${PAGE_PATH}`);
  const hrefs = [...new Set([...html.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) => new URL(m[1], baseUrl).href))];
  if (hrefs.length === 0) throw new Error(`${baseUrl}${PAGE_PATH} の HTML に CSS リンクがありません`);

  const deployed = normalizeCss((await Promise.all(hrefs.map(fetchText))).join('\n'));
  missing = [...expected].filter((decl) => !deployed.includes(decl));
  console.log(
    `${baseUrl}: ${hrefs.length} CSS ファイル / ${expected.size} センチネルトークンを照合 (attempt ${attempt}/${ATTEMPTS})`,
  );
  if (missing.length === 0) break;
  if (attempt < ATTEMPTS) {
    console.log(`${missing.length} 件不足 — ${RETRY_DELAY_MS / 1000}s 後に再試行します`);
    await sleep(RETRY_DELAY_MS);
  }
}

if (missing.length > 0) {
  console.error(`配信 CSS に存在しないトークンが ${missing.length} 件あります:`);
  for (const decl of missing) console.error(`  ${decl}`);
  process.exit(1);
}
console.log('OK: 配信 CSS は globals.css のトークンを全件含んでいます');
