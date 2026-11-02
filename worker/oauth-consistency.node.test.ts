import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import type { D1Binding } from '../src/db/d1/binding';
import { d1Timestamp } from '../src/db/d1/value';
import { consistentOAuth } from './oauth-consistency';

let directory: string;
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Binding }>>>;
let db: D1Binding;
const owner = 'synthetic-owner';
const request = (revoke = false) =>
  new Request(`https://synthetic.invalid/api/auth/oauth2/${revoke ? 'revoke' : 'token'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(
      revoke
        ? { client_id: 'synthetic-client', token: 'synthetic-refresh' }
        : { client_id: 'synthetic-client', grant_type: 'refresh_token', refresh_token: 'synthetic-refresh' },
    ),
  });
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'skillsheet-family-'));
  proxy = await getPlatformProxy<{ DB: D1Binding }>({
    configPath: 'wrangler.d1.jsonc',
    envFiles: [],
    persist: { path: directory },
    remoteBindings: false,
  });
  db = proxy.env.DB;
  const schema = await readFile('src/db/d1/schema.sql', 'utf8');
  await db.batch(
    schema
      .split(';')
      .filter((s) => s.trim())
      .map((s) => db.prepare(s)),
  );
  const now = d1Timestamp();
  await db.batch([
    db
      .prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)')
      .bind(owner, '架空', 'synthetic@example.invalid', now, now),
    db
      .prepare('INSERT INTO oauth_client(id,client_id,redirect_uris) VALUES(?,?,?)')
      .bind('synthetic-client', 'synthetic-client', '[]'),
  ]);
}, 60_000);
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM d1_oauth_family'),
    db.prepare('DELETE FROM oauth_refresh_token'),
    db.prepare('DELETE FROM session'),
    db
      .prepare('INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .bind(
        'synthetic-session',
        'synthetic-session-token',
        owner,
        d1Timestamp(new Date(Date.now() + 60_000)),
        d1Timestamp(),
        d1Timestamp(),
      ),
    db
      .prepare(
        'INSERT INTO oauth_refresh_token(id,token,client_id,session_id,user_id,scopes,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .bind(
        'synthetic-refresh-id',
        createHash('sha256').update('synthetic-refresh').digest('base64url'),
        'synthetic-client',
        'synthetic-session',
        owner,
        '["skillsheet:read"]',
        d1Timestamp(new Date(Date.now() - 60_000)),
        d1Timestamp(new Date(Date.now() + 60_000)),
      ),
  ]);
});
afterAll(async () => {
  await proxy?.dispose();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('refresh発行とfamily revokeの競合境界', () => {
  it('session削除後は公式発行処理を呼ぶ前に拒否する', async () => {
    await db.prepare('DELETE FROM session').all();
    let called = false;
    const result = await consistentOAuth(request(), db, owner, async () => {
      called = true;
      return Response.json({});
    });
    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });
  it.each([
    'Application/X-WWW-Form-Urlencoded',
    'application/x-www-form-urlencoded ; charset=UTF-8',
    'Application/X-WWW-Form-Urlencoded ; charset=UTF-8',
  ])('Content-Typeの大小文字・余白でsession検査を迂回できない: %s', async (contentType) => {
    await db.prepare('DELETE FROM session').all();
    const original = request();
    const headers = new Headers(original.headers);
    headers.set('content-type', contentType);
    let called = false;
    const result = await consistentOAuth(new Request(original, { headers }), db, owner, async () => {
      called = true;
      return Response.json({ access_token: 'must-not-escape' });
    });
    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });
  it.each([
    'grant_type',
    'refresh_token',
    'token',
    'client_id',
    'client_secret',
    'token_type_hint',
  ])('重複したsecurity fieldはtoken/revoke双方で公式handler前に拒否する: %s', async (field) => {
    for (const revoke of [false, true]) {
      const original = request(revoke);
      const form = new URLSearchParams(await original.text());
      form.delete(field);
      form.append(field, 'first-synthetic-value');
      form.append(field, 'last-synthetic-value');
      let called = false;
      const result = await consistentOAuth(
        new Request(original.url, { method: 'POST', headers: original.headers, body: form }),
        db,
        owner,
        async () => {
          called = true;
          return Response.json({ access_token: 'must-not-escape' });
        },
      );
      expect(result.status).toBe(400);
      expect(called).toBe(false);
    }
    expect((await db.prepare('SELECT * FROM d1_oauth_family').all()).results).toEqual([]);
  });
  it('失効と交差した進行中の発行結果を返さず、以後の再送も拒否する', async () => {
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inFlight = consistentOAuth(request(), db, owner, async () => {
      entered();
      await paused;
      return Response.json({ access_token: 'must-not-escape' });
    });
    await ready;
    expect((await consistentOAuth(request(true), db, owner, async () => Response.json({}))).status).toBe(200);
    release();
    const denied = await inFlight;
    expect(denied.status).toBe(400);
    expect(await denied.text()).not.toContain('must-not-escape');
    expect(
      (await consistentOAuth(request(), db, owner, async () => Response.json({ access_token: 'must-not-escape' })))
        .status,
    ).toBe(400);
  });
  it('公式credential検査で失敗したrevokeはfamily状態を変えない', async () => {
    expect(
      (await consistentOAuth(request(true), db, owner, async () => Response.json({}, { status: 401 }))).status,
    ).toBe(401);
    expect((await db.prepare('SELECT * FROM d1_oauth_family').all()).results).toEqual([]);
  });
  it('認証済の旧refresh再利用で公式handlerがfamilyを削除して400を返しても並走発行を失効させる', async () => {
    const old = d1Timestamp(new Date(Date.now() - 120_000));
    await db
      .prepare(
        'INSERT INTO oauth_refresh_token(id,token,client_id,session_id,user_id,scopes,created_at,expires_at,revoked,rotated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        'synthetic-stale-id',
        createHash('sha256').update('synthetic-stale-refresh').digest('base64url'),
        'synthetic-client',
        'synthetic-session',
        owner,
        '["skillsheet:read"]',
        old,
        d1Timestamp(new Date(Date.now() + 60_000)),
        old,
        old,
      )
      .all();
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inFlight = consistentOAuth(request(), db, owner, async () => {
      entered();
      await paused;
      return Response.json({ access_token: 'must-not-escape' });
    });
    await ready;
    try {
      const staleRequest = new Request(request().url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: 'synthetic-client',
          grant_type: 'refresh_token',
          refresh_token: 'synthetic-stale-refresh',
        }),
      });
      const result = await consistentOAuth(staleRequest, db, owner, async () => {
        // 公式providerがcredential検査後に旧token再利用を検出してfamilyを削除する結果を再現する。
        await db
          .prepare('DELETE FROM oauth_refresh_token WHERE client_id=? AND user_id=?')
          .bind('synthetic-client', owner)
          .all();
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      });
      expect(result.status).toBe(400);
      const family = (await db.prepare('SELECT * FROM d1_oauth_family').all()).results;
      expect(family).toHaveLength(1);
      expect(family[0]).toMatchObject({ client_id: 'synthetic-client', user_id: owner });
      expect(family[0]?.revoked_through).toBeGreaterThanOrEqual(Math.floor(Date.parse(old) / 1000));
    } finally {
      release();
    }
    const denied = await inFlight;
    expect(denied.status).toBe(400);
    expect(await denied.text()).not.toContain('must-not-escape');
  });
  it('refreshのcredential検査失敗でsourceが存続していればcutoffを記録しない', async () => {
    const before = (await db.prepare('SELECT * FROM oauth_refresh_token').all()).results;
    let called = false;
    const result = await consistentOAuth(request(), db, owner, async () => {
      called = true;
      return Response.json({ error: 'invalid_client' }, { status: 401 });
    });
    expect(result.status).toBe(401);
    expect(called).toBe(true);
    expect((await db.prepare('SELECT * FROM d1_oauth_family').all()).results).toEqual([]);
    expect((await db.prepare('SELECT * FROM oauth_refresh_token').all()).results).toEqual(before);
  });
});
