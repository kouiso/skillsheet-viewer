import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { getPlatformProxy, unstable_dev } from 'wrangler';
import type { D1Binding } from '../src/db/d1/binding';
import { createD1DocumentStore } from '../src/db/d1/document-store';
import { d1Timestamp } from '../src/db/d1/value';
import { createDocumentService } from '../src/db/document-service';
import { createD1Transport } from '../src/server/d1-transport';

// 本番設定を読まず、隔離したローカルD1と架空アカウントだけでNext API→Workerを実走する。
const output = path.resolve('.evidence/d1-app');
for (const filename of [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.dev.vars',
  '.dev.vars.local',
]) {
  try {
    await access(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
    throw error;
  }
  throw new Error(`隔離検証は既存の ${filename} がある作業ツリーでは起動しません`);
}
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(tmpdir(), 'skillsheet-next-d1-'));
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
const address = socket.address();
assert(address && typeof address === 'object');
const port = address.port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const origin = `http://127.0.0.1:${port}`;
const synthetic = {
  SKILLSHEET_OWNER_ID: 'synthetic-owner',
  D1_GATEWAY_SERVICE_TOKEN: 'synthetic-service-placeholder-only',
  BETTER_AUTH_SECRET: 'synthetic-better-auth-placeholder-only-32',
  SESSION_SECRET: 'synthetic-viewer-placeholder-only-32',
  APP_ORIGINS: JSON.stringify([origin]),
  MCP_ENABLED: 'true',
  MCP_RESOURCE_URL: `${origin}/api/mcp`,
  BETTER_AUTH_URL: origin,
  D1_CIMD_TRANSPORT_URL: `${origin}/api/d1/cimd`,
};
const syntheticKey = generateKeyPairSync('ed25519');
const sheetId = '10000000-0000-4000-8000-000000000001';
const proxy = await getPlatformProxy<{ DB: D1Binding }>({
  configPath: 'wrangler.d1.jsonc',
  envFiles: [],
  persist: { path: path.join(directory, 'v3') },
  remoteBindings: false,
});
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
  await db.batch([
    db
      .prepare('INSERT INTO jwks(id,public_key,private_key,created_at,alg) VALUES(?,?,?,?,?)')
      .bind(
        'synthetic-jwk',
        JSON.stringify(syntheticKey.publicKey.export({ format: 'jwk' })),
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
    .bind(synthetic.SKILLSHEET_OWNER_ID, '架空オーナー', 'synthetic@example.invalid', now, now)
    .all();
  await db
    .prepare(
      'INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    )
    .bind(
      'synthetic-account',
      synthetic.SKILLSHEET_OWNER_ID,
      'credential',
      synthetic.SKILLSHEET_OWNER_ID,
      await hashPassword('synthetic-password-only'),
      now,
      now,
    )
    .all();
  await createDocumentService(
    createD1DocumentStore(db, synthetic.SKILLSHEET_OWNER_ID),
    synthetic.SKILLSHEET_OWNER_ID,
  ).create(sheetId, '架空初期文書', []);
} finally {
  await proxy.dispose();
}

const worker = await unstable_dev('worker/d1-api.ts', {
  config: 'wrangler.d1.jsonc',
  envFiles: [],
  vars: synthetic,
  persistTo: directory,
  ip: '127.0.0.1',
  port: 0,
  local: true,
  logLevel: 'error',
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false, forceLocal: true },
});
const endpoint = `http://127.0.0.1:${worker.port}/`;
const appLog = createWriteStream(path.join(output, 'next-api-server.txt'));
// 親processのDATABASE_URL/secret/監視設定を継承しない。実Neon・telemetryへの接続を作らない。
const app = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      ...synthetic,
      SKILLSHEET_DB_BACKEND: 'd1',
      D1_GATEWAY_URL: endpoint,
      BETTER_AUTH_URL: origin,
      VIEWER_CODE: 'synthetic-viewer-code',
      REVALIDATE_SECRET: 'synthetic-revalidate-placeholder',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
app.stdout.pipe(appLog);
app.stderr.pipe(appLog);

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const r = await fetch(`${origin}/api/auth/get-session`);
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* 起動待ち */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready, 'Next API did not become ready');
  const login = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email: 'synthetic@example.invalid', password: 'synthetic-password-only' }),
  });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  assert(cookie.includes('better-auth.session_token='));
  async function query(name: string, input: unknown) {
    const r = await fetch(`${origin}/api/trpc/${name}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, {
      headers: { cookie },
    });
    assert.equal(r.status, 200, await r.clone().text());
    return (await r.json()).result.data.json;
  }
  const before = await query('sheet.builderState', { sheetId });
  assert.equal(before.snapshot.revision, '0');
  const saved = await fetch(`${origin}/api/trpc/sheet.save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify({ json: { sheetId, expectedRevision: '0', title: 'Next APIで更新した架空文書', blocks: [] } }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await saved.json()).result.data.json.revision, '1');
  const direct = createD1Transport({ endpoint, serviceToken: synthetic.D1_GATEWAY_SERVICE_TOKEN, appOrigin: origin });
  assert.deepEqual(await direct.operation({ operation: 'read', sheetId }, new Headers({ cookie })), {
    status: 'OK',
    snapshot: {
      sheetId,
      title: 'Next APIで更新した架空文書',
      revision: '1',
      blocks: [],
      validation: { editable: true, issues: [] },
    },
  });
  await direct.operation(
    { operation: 'replace', sheetId, expectedRevision: '1', title: 'Worker経由で再更新した架空文書', blocks: [] },
    new Headers({ cookie }),
  );
  const after = await query('sheet.builderState', { sheetId });
  assert.equal(after.snapshot.revision, '2');
  assert.equal(after.snapshot.title, 'Worker経由で再更新した架空文書');
  const viewerRead = await query('sheet.byId', { id: sheetId });
  assert.equal(viewerRead.title, after.snapshot.title);
  assert.equal(viewerRead.revision, '2');
  const denied = await fetch(
    `${origin}/api/trpc/sheet.builderState?input=${encodeURIComponent(JSON.stringify({ json: { sheetId } }))}`,
  );
  assert.equal(denied.status, 401);
  const sessionResult = await fetch(`${origin}/api/auth/get-session?disableCookieCache=true`, { headers: { cookie } });
  const session = await sessionResult.json();
  const jwtData = [
    { alg: 'EdDSA', kid: 'synthetic-jwk' },
    {
      sub: synthetic.SKILLSHEET_OWNER_ID,
      sid: session.session.id,
      azp: 'synthetic-client',
      iss: `${origin}/api/auth`,
      aud: synthetic.MCP_RESOURCE_URL,
      scope: 'skillsheet:read',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  const token = `${jwtData}.${sign(null, Buffer.from(jwtData), syntheticKey.privateKey).toString('base64url')}`;
  const mcpRequest = (name: string) =>
    fetch(`${origin}/api/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }),
    });
  const mcp = await mcpRequest('list_sheets');
  assert.equal(mcp.status, 200, await mcp.clone().text());
  assert((await mcp.text()).includes(after.snapshot.title));
  assert.equal((await mcpRequest('update_company')).status, 403);
  assert.equal((await fetch(`${origin}/.well-known/oauth-protected-resource/api/mcp`)).status, 200);
  const nodeBoundary = await fetch(`${origin}/api/d1/cimd`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-skillsheet-service-token': synthetic.D1_GATEWAY_SERVICE_TOKEN },
    body: JSON.stringify({ operation: 'metadata.fetch', url: 'https://127.0.0.1/metadata', method: 'GET' }),
  });
  assert.equal(nodeBoundary.status, 502); // DNS pinningのprivate IP拒否、実外部通信なし。
  const evidence = {
    status: 'passed',
    runtime: process.version,
    backend: 'local workerd D1',
    realData: false,
    checks: [
      'Next Better Auth proxy login',
      'Next builderState editor authorization',
      'Next save → Worker read',
      'Worker replace → Next read',
      'D1 viewer cache bypass',
      'unauthenticated builder denied',
      'Next MCP → Worker → D1 read and write scope denial',
      'Next canonical OAuth discovery',
      'Next CIMD Node boundary rejects private IP',
    ],
    limitations: [
      'Next dev API only; Google Fonts prevents production build',
      'Next UI on Workers is not verified; real credentials/grants are not used',
    ],
  };
  await writeFile(path.join(output, 'next-api-result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
} finally {
  if (app.exitCode === null) {
    app.kill('SIGTERM');
    await new Promise<void>((resolve) => app.once('exit', () => resolve()));
  }
  appLog.end();
  await worker.stop();
  await rm(directory, { recursive: true, force: true });
}
