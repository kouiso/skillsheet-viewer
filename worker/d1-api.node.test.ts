import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy, type Unstable_DevWorker, unstable_dev } from 'wrangler';
import type { D1Binding } from '../src/db/d1/binding';
import { createD1DocumentStore } from '../src/db/d1/document-store';
import { createDocumentService } from '../src/db/document-service';
import { createD1Transport } from '../src/server/d1-transport';

// 全て架空。実secretや実ユーザーを読み込まないローカル専用fixture。
const env = {
  SKILLSHEET_OWNER_ID: 'synthetic-owner',
  D1_GATEWAY_SERVICE_TOKEN: 'synthetic-service-placeholder-only',
  BETTER_AUTH_SECRET: 'synthetic-better-auth-placeholder-only-32',
  SESSION_SECRET: 'synthetic-viewer-placeholder-only-32',
  APP_ORIGINS: '["http://127.0.0.1:3210","http://localhost:3211"]',
};
const sheetId = '10000000-0000-4000-8000-000000000001';
let worker: Unstable_DevWorker;
let directory: string;
let endpoint: string;
let editorCookie: string;

function headers(appOrigin = 'http://127.0.0.1:3210', cookie = editorCookie) {
  return new Headers({
    'x-skillsheet-service-token': env.D1_GATEWAY_SERVICE_TOKEN,
    'x-skillsheet-app-origin': appOrigin,
    'content-type': 'application/json',
    cookie: cookie ?? '',
  });
}
function viewerToken(exp = Math.floor(Date.now() / 1000) + 60) {
  const payload = Buffer.from(JSON.stringify({ iat: 0, exp })).toString('base64url');
  return `${payload}.${createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url')}`;
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'skillsheet-d1-http-'));
  const platform = await getPlatformProxy<{ DB: D1Binding }>({
    configPath: 'wrangler.d1.jsonc',
    envFiles: [],
    persist: { path: path.join(directory, 'v3') },
    remoteBindings: false,
  });
  try {
    const db = platform.env.DB;
    const schema = await readFile('src/db/d1/schema.sql', 'utf8');
    await db.batch(
      schema
        .split(';')
        .filter((sql) => sql.trim())
        .map((sql) => db.prepare(sql)),
    );
    const now = new Date().toISOString();
    await db
      .prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)')
      .bind(env.SKILLSHEET_OWNER_ID, '架空オーナー', 'synthetic@example.invalid', now, now)
      .all();
    await db
      .prepare(
        'INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .bind(
        'synthetic-account',
        env.SKILLSHEET_OWNER_ID,
        'credential',
        env.SKILLSHEET_OWNER_ID,
        await hashPassword('synthetic-password-only'),
        now,
        now,
      )
      .all();
    await createDocumentService(createD1DocumentStore(db, env.SKILLSHEET_OWNER_ID), env.SKILLSHEET_OWNER_ID).create(
      sheetId,
      '架空の文書',
      [{ id: '20000000-0000-4000-8000-000000000001', type: 'markdown', order: 0, data: { markdown: '合成本文' } }],
    );
  } finally {
    await platform.dispose();
  }
  worker = await unstable_dev('worker/d1-api.ts', {
    config: 'wrangler.d1.jsonc',
    envFiles: [],
    vars: env,
    persistTo: directory,
    ip: '127.0.0.1',
    port: 0,
    local: true,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false, forceLocal: true },
  });
  endpoint = `http://127.0.0.1:${worker.port}/`;
  const h = headers(undefined, '');
  h.set('origin', 'http://127.0.0.1:3210');
  const login = await fetch(new URL('/api/auth/sign-in/email', endpoint), {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email: 'synthetic@example.invalid', password: 'synthetic-password-only' }),
  });
  expect(login.status, await login.clone().text()).toBe(200);
  editorCookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect(editorCookie).toContain('better-auth.session_token=');
}, 60_000);

afterAll(async () => {
  await worker?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('Worker HTTP + Better Auth + 同じローカルD1', () => {
  it('Vercel側と第二アプリoriginの接続で同じ文書をread/writeできる', async () => {
    const first = createD1Transport({
      endpoint,
      serviceToken: env.D1_GATEWAY_SERVICE_TOKEN,
      appOrigin: 'http://127.0.0.1:3210',
    });
    const second = createD1Transport({
      endpoint,
      serviceToken: env.D1_GATEWAY_SERVICE_TOKEN,
      appOrigin: 'http://localhost:3211',
    });
    const userHeaders = new Headers({ cookie: editorCookie });
    expect(await first.operation({ operation: 'read', sheetId }, userHeaders)).toMatchObject({
      status: 'OK',
      snapshot: { revision: '0' },
    });
    expect(
      await second.operation(
        { operation: 'replace', sheetId, expectedRevision: '0', title: '第二originから更新', blocks: [] },
        userHeaders,
      ),
    ).toMatchObject({ status: 'OK', snapshot: { revision: '1' } });
    expect(await first.operation({ operation: 'read', sheetId }, userHeaders)).toMatchObject({
      status: 'OK',
      snapshot: { title: '第二originから更新', revision: '1', blocks: [] },
    });
    await expect(
      first.operation(
        { operation: 'replace', sheetId, expectedRevision: '0', title: '古い版', blocks: [] },
        userHeaders,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('サービス認証だけでは本文を取得できず、owner偽装・SQL・余分な引数も拒否', async () => {
    for (const body of [
      { operation: 'read', sheetId },
      { operation: 'read', sheetId, owner: env.SKILLSHEET_OWNER_ID },
      { operation: 'execute', sql: 'SELECT * FROM user' },
    ]) {
      const result = await fetch(new URL('/v1/operation', endpoint), {
        method: 'POST',
        headers: headers(undefined, ''),
        body: JSON.stringify(body),
      });
      expect([400, 403]).toContain(result.status);
      expect(await result.text()).not.toContain('合成本文');
    }
    const h = headers();
    h.delete('x-skillsheet-service-token');
    expect(
      (await fetch(new URL('/v1/operation', endpoint), { method: 'POST', headers: h, body: '{"operation":"list"}' }))
        .status,
    ).toBe(403);
  });
  it('閲覧cookieはreadだけ許し、編集・履歴・Driveを拒否', async () => {
    const client = createD1Transport({
      endpoint,
      serviceToken: env.D1_GATEWAY_SERVICE_TOKEN,
      appOrigin: 'http://127.0.0.1:3210',
    });
    const h = new Headers({ cookie: `session=${viewerToken()}` });
    expect(await client.operation({ operation: 'read', sheetId }, h)).toMatchObject({ status: 'OK' });
    await expect(client.operation({ operation: 'delete', sheetId, expectedRevision: '1' }, h)).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
    await expect(
      client.operation({ operation: 'history.list', sheetId, before: null, limit: 20 }, h),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(client.operation({ operation: 'drive.read' }, h)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(
      client.operation({ operation: 'read', sheetId }, new Headers({ cookie: `session=${viewerToken(1)}` })),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('確認値なしの履歴復元・不正origin・公開signupを拒否', async () => {
    const client = createD1Transport({
      endpoint,
      serviceToken: env.D1_GATEWAY_SERVICE_TOKEN,
      appOrigin: 'http://127.0.0.1:3210',
    });
    await expect(
      client.operation(
        { operation: 'history.restore', sheetId, target: '0', expectedRevision: '1' },
        new Headers({ cookie: editorCookie }),
      ),
    ).rejects.toMatchObject({ code: 'VISIBILITY_CONFIRMATION_REQUIRED' });
    const h = headers('https://attacker.invalid');
    expect(
      (await fetch(new URL('/v1/operation', endpoint), { method: 'POST', headers: h, body: '{"operation":"list"}' }))
        .status,
    ).toBe(403);
    const signupHeaders = headers();
    signupHeaders.set('origin', 'http://127.0.0.1:3210');
    const signup = await fetch(new URL('/api/auth/sign-up/email', endpoint), {
      method: 'POST',
      headers: signupHeaders,
      body: JSON.stringify({ email: 'nobody@example.invalid', password: 'synthetic-password-only', name: '架空' }),
    });
    expect(signup.status).toBeGreaterThanOrEqual(400);
  });
  it('viewerのJSON応答からhidden会社とhidden案件を除外しeditorは全件を読む', async () => {
    const client = createD1Transport({
      endpoint,
      serviceToken: env.D1_GATEWAY_SERVICE_TOKEN,
      appOrigin: 'http://127.0.0.1:3210',
    });
    const id = '10000000-0000-4000-8000-000000000002';
    const company = { id: 'visible', name: '架空公開会社', kind: '', period: '', note: '' };
    const item = {
      id: 'visible',
      companyId: 'visible',
      title: '架空公開案件',
      scope: '',
      period: '',
      role: '',
      team: '',
      duties: '',
      acquired: '',
      comment: '',
      process: [],
      tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
    };
    await client.operation(
      {
        operation: 'create',
        sheetId: id,
        title: '架空公開範囲',
        blocks: [
          {
            id: '20000000-0000-4000-8000-000000000002',
            type: 'project',
            order: 0,
            data: {
              companies: [company, { ...company, id: 'hidden', name: 'synthetic-hidden-company', hidden: true }],
              items: [
                item,
                { ...item, id: 'hidden-item', title: 'synthetic-hidden-item', hidden: true },
                { ...item, id: 'hidden-company-item', companyId: 'hidden', title: 'synthetic-hidden-company-item' },
              ],
            },
          },
        ],
      },
      new Headers({ cookie: editorCookie }),
    );
    const raw = JSON.stringify(
      await client.operation({ operation: 'read', sheetId: id }, new Headers({ cookie: editorCookie })),
    );
    expect(raw).toContain('synthetic-hidden-company');
    const visible = JSON.stringify(
      await client.operation({ operation: 'read', sheetId: id }, new Headers({ cookie: `session=${viewerToken()}` })),
    );
    expect(visible).toContain('架空公開案件');
    expect(visible).not.toContain('synthetic-hidden');
  });
});
