/**
 * #607 Workers実ランタイム出力検証ハーネス。
 *
 * 合成データだけの隔離ローカルD1に対し、Next production (`next start`) と
 * OpenNext workerd (`wrangler dev` on `.open-next/worker.js`) の両ランタイムから
 * 同一文書の出力を実行して検査する。
 *
 *   pnpm build && pnpm build:workers の後に:
 *   pnpm exec tsx script/verify-607-output.ts            # 両ランタイム
 *   pnpm exec tsx script/verify-607-output.ts next       # Next のみ
 *   pnpm exec tsx script/verify-607-output.ts worker     # workerd のみ
 *
 * 検査: PDF（全文・要約、実ブラウザ=Chrome）/ XLSX（全文・要約）/ DOCX（全文）の
 * ダウンロード・MIME・形式・日本語期待本文・欠落/重複、未提供edition拒否・
 * 未認証・不正ID、出力前後のrevision不変、ブラウザ外部通信ゼロ、
 * サーバーログに本文を含まないこと。
 * 結果は .evidence/607-output/ へ JSON・画像・出力ファイルを書く。
 */
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { hashPassword } from 'better-auth/crypto';
import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist';
import { getPlatformProxy, unstable_dev } from 'wrangler';
import type { D1Binding } from '../src/db/d1/binding';
import { createD1DocumentStore } from '../src/db/d1/document-store';
import { d1Timestamp } from '../src/db/d1/value';
import { createDocumentService } from '../src/db/document-service';
import { buildConsoleDemoBlocks } from '../src/db/fixture/fictional-demo';
import { createD1Transport } from '../src/server/d1-transport';

const ONLY = process.argv[2]; // 'next' | 'worker' | undefined
// 打ち間違いで何も検査せず ALL OK になるのを防ぐため、setup より前に弾く
if (ONLY !== undefined && ONLY !== 'next' && ONLY !== 'worker') {
  console.error(`[FAILED] 引数は next / worker のどちらか（指定なしで両方）: ${ONLY}`);
  process.exit(1);
}
const OUT = path.resolve('.evidence/607-output');
const TITLE = '架空出力検証シート';
const OWNER = 'synthetic-owner';
const SHEET_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_SECRET = 'synthetic-viewer-placeholder-only-32';

// 期待本文。形式ごとに実際に出る代表文字列（重複上限つき）。
type Expect = { str: string; max: number };
const E = (str: string, max = 4): Expect => ({ str, max });
const COMMON_XLSX_DOCX: Expect[] = [
  E('見本 花子（架空）'),
  E('架空の在庫管理画面'),
  E('例示用の家計簿アプリ'),
  // 技術語は11案件+技能表ぶん直列するので上限は高め（重複検査は固有名詞で行う）。
  E('TypeScript', 24),
  E('PostgreSQL', 24),
];
const DOCX_FULL: Expect[] = COMMON_XLSX_DOCX;
// PDFは名前・社名が各頁ヘッダで繰り返されるため上限を緩める（欠落が主目的）。
const PDF_FULL: Expect[] = [
  E('見本 花子（架空）', 24),
  E('架空の在庫管理画面'),
  E('例示用の家計簿アプリ'),
  E('TypeScript', 24),
  E('PostgreSQL', 24),
  E('架空商事', 16),
  E('サンプルエンジニア / 見本リーダー', 24),
  E('TypeScript / JavaScript'),
];
// 要約版は技術列を出さない（digest行は index/期間/案件名/チーム）。
const DIGEST_BODY: Expect[] = [
  E('見本 花子（架空）'),
  E('架空の在庫管理画面'),
  E('例示用の家計簿アプリ'),
  E('（要約版）', 8),
];
const PDF_DIGEST: Expect[] = [
  E('見本 花子（架空）', 24),
  E('架空の在庫管理画面'),
  E('例示用の家計簿アプリ'),
  E('（要約版）', 16),
  E('TypeScript / JavaScript'),
];
const XLSX_DIGEST: Expect[] = DIGEST_BODY;
// 診断・ログに漏れてはいけない本文の代表（長い固有情報）。
const SENSITIVE_BODY = 'この文章は表示確認用の架空の自己紹介です。実在の人物・経歴・会社とは関係ありません。';

for (const f of ['.env', '.env.local', '.env.development', '.env.development.local', '.dev.vars', '.dev.vars.local']) {
  try {
    await access(f);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
    throw e;
  }
  throw new Error(`隔離検証は既存の ${f} がある作業ツリーでは起動しません`);
}
await mkdir(OUT, { recursive: true });

const freePort = async () => {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const a = s.address();
  assert(a && typeof a === 'object');
  const p = a.port;
  await new Promise<void>((r) => s.close(() => r()));
  return p;
};

const nextPort = await freePort();
const workerPort = await freePort();
const nextOrigin = `http://127.0.0.1:${nextPort}`;
const workerOrigin = `http://127.0.0.1:${workerPort}`;

const directory = await mkdtemp(path.join(tmpdir(), 'skillsheet-607-'));
const synthetic: Record<string, string> = {
  SKILLSHEET_OWNER_ID: OWNER,
  D1_GATEWAY_SERVICE_TOKEN: 'synthetic-service-placeholder-only',
  BETTER_AUTH_SECRET: 'synthetic-better-auth-placeholder-only-32',
  SESSION_SECRET,
  APP_ORIGINS: JSON.stringify([nextOrigin, workerOrigin]),
  MCP_ENABLED: 'false',
};

// ---- 隔離D1へスキーマと合成データを投入 ----
const proxy = await getPlatformProxy<{ DB: D1Binding }>({
  configPath: 'wrangler.d1.jsonc',
  envFiles: [],
  persist: { path: path.join(directory, 'v3') },
  remoteBindings: false,
});
let baseRevision: string;
try {
  const db = proxy.env.DB;
  const schema = await readFile('src/db/d1/schema.sql', 'utf8');
  await db.batch(
    schema
      .split(';')
      .filter((sql) => sql.trim())
      .map((sql) => db.prepare(sql)),
  );
  const now = d1Timestamp();
  const key = generateKeyPairSync('ed25519');
  await db.batch([
    db
      .prepare('INSERT INTO jwks(id,public_key,private_key,created_at,alg) VALUES(?,?,?,?,?)')
      .bind(
        'synthetic-jwk',
        JSON.stringify(key.publicKey.export({ format: 'jwk' })),
        'unusable-placeholder',
        now,
        'EdDSA',
      ),
    db
      .prepare('INSERT INTO oauth_client(id,client_id,redirect_uris) VALUES(?,?,?)')
      .bind('synthetic-client', 'synthetic-client', '[]'),
  ]);
  await db
    .prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)')
    .bind(OWNER, '架空オーナー', 'synthetic@example.invalid', now, now)
    .all();
  await db
    .prepare(
      'INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    )
    .bind('synthetic-account', OWNER, 'credential', OWNER, await hashPassword('synthetic-password-only'), now, now)
    .all();
  const service = createDocumentService(createD1DocumentStore(db, OWNER), OWNER);
  const blocks = buildConsoleDemoBlocks().map((b, order) => ({ ...b, id: randomUUID(), order }));
  const snapshot = await service.create(SHEET_ID, TITLE, blocks);
  baseRevision = snapshot.revision;
  console.log(`[setup] sheet ${SHEET_ID} revision=${baseRevision}`);
} finally {
  await proxy.dispose();
}

// ---- D1ゲートウェイworker起動 ----
const gateway = await unstable_dev('worker/d1-api.ts', {
  config: 'wrangler.d1.jsonc',
  envFiles: [],
  vars: { ...synthetic, BETTER_AUTH_URL: nextOrigin },
  persistTo: directory,
  ip: '127.0.0.1',
  port: 0,
  local: true,
  logLevel: 'error',
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false, forceLocal: true },
});
const gatewayUrl = `http://127.0.0.1:${gateway.port}/`;
console.log(`[setup] gateway ${gatewayUrl}`);
const direct = createD1Transport({
  endpoint: gatewayUrl,
  serviceToken: synthetic.D1_GATEWAY_SERVICE_TOKEN,
  appOrigin: nextOrigin,
});

const viewerCookie = (() => {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 7 * 24 * 3600 })).toString('base64url');
  const sig = createHmac('sha256', Buffer.from(SESSION_SECRET, 'utf-8')).update(payload).digest('base64url');
  return `session=${payload}.${sig}`;
})();

const results: Record<string, unknown> = {};
const children: ChildProcess[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const groupAlive = (pid: number) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};
// wrangler は workerd を子に持つ。親だけ SIGKILL すると workerd が残り、workerd は SIGTERM でも止まらないことがある。
// detached で起動して自分のプロセスグループを作り、グループごと SIGTERM → 残れば SIGKILL で止める。
// 親が先に死んでもグループに子が残る場合があるので、親の終了状態ではなくグループの生死を見る。
async function stopTree(c: ChildProcess, graceMs = 3000): Promise<void> {
  const pid = c.pid;
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {}
  for (let waited = 0; waited < graceMs && groupAlive(pid); waited += 100) await sleep(100);
  if (groupAlive(pid)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {}
    for (let waited = 0; waited < 2000 && groupAlive(pid); waited += 100) await sleep(100);
  }
}
const cleanup = async () => {
  await Promise.allSettled(children.map((c) => stopTree(c)));
  await gateway.stop().catch(() => {});
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => void cleanup().then(() => process.exit(128 + { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[sig])));
}

// 1 回の fetch は 5 秒、待ち全体は 120 秒で打ち切る。相手が応答しないまま台本ごと止まるのを防ぐ。
const READY_FETCH_TIMEOUT_MS = 5_000;
const READY_TOTAL_TIMEOUT_MS = 120_000;
async function waitReady(url: string, totalMs = READY_TOTAL_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(READY_FETCH_TIMEOUT_MS) });
      if (r.status === 200) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`${url} did not become ready within ${totalMs}ms`);
}

async function zipText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const parts: string[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!/\.(xml|rels)$/.test(name) || entry.dir) continue;
    parts.push(await entry.async('string'));
  }
  return parts.join('\n');
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = 0;
  for (;;) {
    i = haystack.indexOf(needle, i);
    if (i === -1) return n;
    n++;
    i += needle.length;
  }
}

function checkBody(format: string, label: string, text: string, expected: Expect[]) {
  const counts: Record<string, number> = {};
  for (const { str, max } of expected) {
    const n = countOccurrences(text, str);
    counts[str] = n;
    assert(n >= 1, `${format}/${label}: expected "${str}" missing`);
    assert(n <= max, `${format}/${label}: "${str}" duplicated ${n}x (max ${max})`);
  }
  return counts;
}

async function pdfText(buf: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(buf) }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(''));
  }
  return parts.join('\n');
}

async function verifyRuntime(kind: 'next' | 'worker') {
  const origin = kind === 'next' ? nextOrigin : workerOrigin;
  const logPath = path.join(OUT, `${kind}-server.log`);
  const log = createWriteStream(logPath);
  let app: ChildProcess;
  if (kind === 'next') {
    app = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(nextPort)],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          NEXT_TELEMETRY_DISABLED: '1',
          ...synthetic,
          SKILLSHEET_DB_BACKEND: 'd1',
          D1_GATEWAY_URL: gatewayUrl,
          BETTER_AUTH_URL: nextOrigin,
          VIEWER_CODE: 'synthetic-viewer-code',
          REVALIDATE_SECRET: 'synthetic-revalidate-placeholder',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      },
    );
  } else {
    const envFile = path.join(OUT, 'worker.vars');
    await writeFile(
      envFile,
      Object.entries({
        ...synthetic,
        SKILLSHEET_DB_BACKEND: 'd1',
        D1_GATEWAY_URL: gatewayUrl,
        BETTER_AUTH_URL: workerOrigin,
        VIEWER_CODE: 'synthetic-viewer-code',
        REVALIDATE_SECRET: 'synthetic-revalidate-placeholder',
      })
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join('\n'),
    );
    app = spawn(
      'node_modules/.bin/wrangler',
      [
        'dev',
        '-c',
        'wrangler.ui.jsonc',
        '--local',
        '--ip',
        '127.0.0.1',
        '--port',
        String(workerPort),
        '--env-file',
        envFile,
        '--show-interactive-dev-session=false',
      ],
      {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      },
    );
  }
  children.push(app);
  app.stdout?.pipe(log);
  app.stderr?.pipe(log);
  const report: Record<string, unknown> = { origin };

  try {
    await waitReady(`${origin}/api/auth/get-session`);
    console.log(`[${kind}] ready at ${origin}`);

    // ---- 実route: XLSX全文・要約、DOCX全文 ----
    const h = { cookie: viewerCookie };
    const revBefore = await direct.operation({ operation: 'read', sheetId: SHEET_ID }, new Headers(h));

    const dl = async (p: string) => {
      const r = await fetch(`${origin}${p}`, { headers: h });
      return r;
    };
    const xlsxFull = await dl('/api/sheet/export-xlsx');
    assert.equal(xlsxFull.status, 200, `xlsx full status ${xlsxFull.status}`);
    assert.match(xlsxFull.headers.get('content-type') ?? '', /spreadsheetml\.sheet/);
    assert.match(xlsxFull.headers.get('content-disposition') ?? '', /attachment; filename\*=UTF-8''/);
    assert.equal(xlsxFull.headers.get('cache-control'), 'no-store');
    const xlsxFullBuf = Buffer.from(await xlsxFull.arrayBuffer());
    await writeFile(path.join(OUT, `${kind}-full.xlsx`), xlsxFullBuf);
    const checks: Record<string, unknown> = {};
    checks['xlsx-full'] = checkBody('xlsx', 'full', await zipText(xlsxFullBuf), COMMON_XLSX_DOCX);

    const xlsxDigest = await dl('/api/sheet/export-xlsx?edition=digest');
    assert.equal(xlsxDigest.status, 200, `xlsx digest status ${xlsxDigest.status}`);
    assert.match(decodeURIComponent(xlsxDigest.headers.get('content-disposition') ?? ''), /（要約版）\.xlsx/);
    const xlsxDigestBuf = Buffer.from(await xlsxDigest.arrayBuffer());
    await writeFile(path.join(OUT, `${kind}-digest.xlsx`), xlsxDigestBuf);
    checks['xlsx-digest'] = checkBody('xlsx', 'digest', await zipText(xlsxDigestBuf), XLSX_DIGEST);

    const docx = await dl('/api/sheet/export-docx');
    assert.equal(docx.status, 200, `docx status ${docx.status}`);
    assert.match(docx.headers.get('content-type') ?? '', /wordprocessingml\.document/);
    const docxBuf = Buffer.from(await docx.arrayBuffer());
    await writeFile(path.join(OUT, `${kind}-full.docx`), docxBuf);
    checks['docx-full'] = checkBody('docx', 'full', await zipText(docxBuf), DOCX_FULL);

    // ---- 拒否系 ----
    const denials: [string, number][] = [
      ['/api/sheet/export-xlsx?edition=bogus', 400],
      ['/api/sheet/export-docx?edition=digest', 400],
      ['/api/sheet/export-docx?edition=bogus', 400],
      ['/api/sheet/export-xlsx?id=not-a-uuid', 400],
      ['/api/sheet/export-docx?id=not-a-uuid', 400],
      ['/api/sheet/export-xlsx?id=20000000-0000-4000-8000-000000000009', 404],
      ['/api/sheet/export-docx?id=20000000-0000-4000-8000-000000000009', 404],
    ];
    for (const [p, want] of denials) {
      const r = await dl(p);
      assert.equal(r.status, want, `${p} -> ${r.status} (want ${want})`);
    }
    for (const p of ['/api/sheet/export-xlsx', '/api/sheet/export-docx']) {
      const r = await fetch(`${origin}${p}`);
      assert.equal(r.status, 401, `${p} no-auth -> ${r.status}`);
      const body = await r.text();
      assert(!body.includes(SENSITIVE_BODY), `${p} error body leaks document text`);
    }
    report.routes = 'ok';
    report.bodyChecks = checks;

    // ---- 実ブラウザ: PDF全文・要約 + 画面証跡 ----
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const external: string[] = [];
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      page.on('request', (req) => {
        const u = req.url();
        if (/^(data:|blob:|about:|chrome-extension:)/.test(u)) return;
        const host = new URL(u).hostname;
        if (host !== '127.0.0.1' && host !== 'localhost') external.push(u);
      });
      await context.addCookies([{ name: 'session', value: viewerCookie.slice(8), url: origin }]);
      await page.goto(`${origin}/view/db/${SHEET_ID}`, { waitUntil: 'networkidle' });
      await page.getByText('見本 花子（架空）').first().waitFor({ timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, `${kind}-viewer-1440.png`) });

      // PC: PDFボタン直行 → 全文PDF
      const pdfFullDl = page.waitForEvent('download', { timeout: 120000 });
      await page.locator('.console-desktop-bar').getByRole('button', { name: 'PDFダウンロード' }).click();
      const pdfFullFile = path.join(OUT, `${kind}-full.pdf`);
      await (await pdfFullDl).saveAs(pdfFullFile);

      // PC: Officeメニュー目視（Excel/Word導線）
      await page.locator('.console-desktop-bar').getByRole('button', { name: 'Excel / Wordをダウンロード' }).click();
      await page.getByRole('button', { name: 'Wordダウンロード' }).waitFor();
      await page.screenshot({ path: path.join(OUT, `${kind}-menu-office-1440.png`) });
      await page.keyboard.press('Escape');

      // PC: 要約版メニュー → 要約版PDF
      await page.locator('.console-desktop-bar').getByRole('button', { name: '要約版をダウンロード' }).click();
      await page.getByRole('button', { name: 'PDF（要約版）ダウンロード' }).waitFor();
      await page.screenshot({ path: path.join(OUT, `${kind}-menu-digest-1440.png`) });
      const pdfDigestDl = page.waitForEvent('download', { timeout: 120000 });
      await page.getByRole('button', { name: 'PDF（要約版）ダウンロード' }).click();
      const pdfDigestFile = path.join(OUT, `${kind}-digest.pdf`);
      await (await pdfDigestDl).saveAs(pdfDigestFile);

      // 390px: ダウンロードメニュー目視（SP導線）
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await page.locator('.console-mobile-bar').getByRole('button', { name: 'ダウンロード' }).click();
      await page.getByRole('button', { name: 'Wordダウンロード' }).waitFor();
      await page.screenshot({ path: path.join(OUT, `${kind}-menu-390.png`) });
      await page.keyboard.press('Escape');
      await page.screenshot({ path: path.join(OUT, `${kind}-viewer-390.png`) });
      await context.close();

      checks['pdf-full'] = checkBody(
        'pdf',
        'full',
        await pdfText((await readFile(pdfFullFile)) as unknown as Buffer),
        PDF_FULL,
      );
      checks['pdf-digest'] = checkBody(
        'pdf',
        'digest',
        await pdfText((await readFile(pdfDigestFile)) as unknown as Buffer),
        PDF_DIGEST,
      );
    } finally {
      await browser.close();
    }
    assert.deepEqual(external, [], `external requests: ${JSON.stringify(external)}`);
    report.browser = 'ok';

    // ---- 出力前後でrevision不変 ----
    const revAfter = await direct.operation({ operation: 'read', sheetId: SHEET_ID }, new Headers(h));
    assert.equal(
      (revAfter as { snapshot: { revision: string } }).snapshot.revision,
      (revBefore as { snapshot: { revision: string } }).snapshot.revision,
      'revision changed by exports',
    );
    report.revision = (revAfter as { snapshot: { revision: string } }).snapshot.revision;
  } finally {
    await stopTree(app);
    log.end();
  }
  // 診断に本文を含まないこと
  const logText = await readFile(logPath, 'utf8').catch(() => '');
  assert(!logText.includes(SENSITIVE_BODY), `${kind} server log leaks document body`);
  results[kind] = report;
  console.log(`[${kind}] verification done`);
}

let failed = false;
try {
  if (!ONLY || ONLY === 'next') await verifyRuntime('next');
  if (!ONLY || ONLY === 'worker') await verifyRuntime('worker');
  results.baseRevision = baseRevision;
  const existing = await readFile(path.join(OUT, 'report.json'), 'utf8')
    .then((t) => JSON.parse(t) as Record<string, unknown>)
    .catch(() => ({}));
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ ...existing, ...results }, null, 2));
  console.log(`ALL OK -> ${OUT}`);
} catch (e) {
  // finally 内の process.exit(0) が失敗を握りつぶし、終了コード0・エラー無しで終わっていた
  failed = true;
  console.error('[FAILED] #607 output verification', e);
} finally {
  // gateway.stop() がハングするケースがあるため終了は打ち切る
  await Promise.race([cleanup(), new Promise((r) => setTimeout(r, 5000))]);
  process.exit(failed ? 1 : 0);
}
