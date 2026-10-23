import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deriveDpopAth, deriveDpopJkt } from 'better-auth/oauth2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import type { D1Binding } from '../src/db/d1/binding';
import { d1Timestamp } from '../src/db/d1/value';
import { handleD1Mcp, tokenHash, verifyD1OAuth } from './d1-oauth';

// ここで作る鍵/tokenは使い捨て合成fixture。秘密鍵をファイル・D1へ保存しない。
const key = generateKeyPairSync('ed25519');
const jwk = key.publicKey.export({ format: 'jwk' });
const privateJwk = key.privateKey.export({ format: 'jwk' });
const issuer = 'https://synthetic.example.invalid/api/auth';
const resource = 'https://synthetic.example.invalid/api/mcp';
const owner = 'synthetic-owner';
const otherUser = 'synthetic-other-user';
let db: D1Binding;
let platform: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Binding }>>>;
let directory: string;

function jwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'EdDSA', kid: 'synthetic-jwk' },
) {
  const data = [header, payload].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${data}.${sign(null, Buffer.from(data), createPrivateKey({ key: privateJwk, format: 'jwk' })).toString('base64url')}`;
}
const claims = () => ({
  sub: owner,
  iss: issuer,
  aud: resource,
  azp: 'synthetic-client',
  client_id: 'synthetic-client',
  sid: 'synthetic-session',
  scope: 'skillsheet:read',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300,
});
const request = (token = jwt(claims()), method = 'POST') =>
  new Request(resource, { method, headers: { authorization: `Bearer ${token}` } });

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'skillsheet-d1-oauth-'));
  platform = await getPlatformProxy<{ DB: D1Binding }>({
    configPath: 'wrangler.d1.jsonc',
    envFiles: [],
    persist: { path: directory },
    remoteBindings: false,
  });
  db = platform.env.DB;
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
      .bind('synthetic-jwk', JSON.stringify(jwk), 'unusable-placeholder', now, 'EdDSA'),
    db
      .prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)')
      .bind(owner, '架空', 'synthetic@example.invalid', now, now),
    db
      .prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)')
      .bind(otherUser, '別の架空ユーザー', 'synthetic-other@example.invalid', now, now),
    db
      .prepare('INSERT INTO oauth_client(id,client_id,redirect_uris,metadata) VALUES(?,?,?,?)')
      .bind('synthetic-client', 'synthetic-client', '[]', 'null'),
    db
      .prepare('INSERT INTO oauth_resource(id,identifier,name,allowed_scopes) VALUES(?,?,?,?)')
      .bind('synthetic-resource', resource, '架空', '["skillsheet:read","skillsheet:write"]'),
  ]);
}, 60_000);
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM session'),
    db.prepare('DELETE FROM d1_dpop_replay'),
    db.prepare('DELETE FROM d1_oauth_revocation'),
    db.prepare('UPDATE oauth_client SET disabled=0'),
    db.prepare('UPDATE jwks SET expires_at=NULL'),
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
  ]);
});
afterAll(async () => {
  await platform?.dispose();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('D1 OAuthの署名・失効・セッション・DPoP境界', () => {
  it('既存issuer/audienceのJWTをlocal公開鍵で検証し、NULL JSONを更新しない', async () => {
    expect(await verifyD1OAuth(request(), db, owner, issuer, resource)).toMatchObject({
      sub: owner,
      sid: 'synthetic-session',
    });
    expect((await db.prepare('SELECT metadata FROM oauth_client').all()).results).toEqual([{ metadata: 'null' }]);
  });
  it.each([
    { iss: 'https://attacker.invalid' },
    { aud: 'https://attacker.invalid' },
    { sub: 'another-owner' },
    { exp: 1 },
    { sid: undefined },
    { sid: 'missing-session' },
    { azp: 'missing-client' },
  ])('不正claimsを拒否: %j', async (overrides) => {
    await expect(
      verifyD1OAuth(request(jwt({ ...claims(), ...overrides })), db, owner, issuer, resource),
    ).rejects.toBeTruthy();
  });
  it('改ざん署名を拒否する', async () => {
    const token = jwt(claims()).split('.');
    token[1] = Buffer.from(JSON.stringify({ ...claims(), scope: 'skillsheet:write' })).toString('base64url');
    await expect(verifyD1OAuth(request(token.join('.')), db, owner, issuer, resource)).rejects.toBeTruthy();
  });
  it.each([
    'UPDATE oauth_client SET disabled=1',
    'DELETE FROM oauth_client',
    'DELETE FROM session',
    "UPDATE session SET expires_at='2000-01-01T00:00:00.000000Z'",
  ])('DB失効をcookie/JWK cacheで隠さない: %s', async (sql) => {
    const token = jwt(claims());
    expect(await verifyD1OAuth(request(token), db, owner, issuer, resource)).toBeTruthy();
    // client削除は以降のfixtureへ影響するためこのケースだけ復元する。
    await db.prepare(sql).all();
    await expect(verifyD1OAuth(request(token), db, owner, issuer, resource)).rejects.toBeTruthy();
    if (sql === 'DELETE FROM oauth_client')
      await db
        .prepare('INSERT INTO oauth_client(id,client_id,redirect_uris,metadata) VALUES(?,?,?,?)')
        .bind('synthetic-client', 'synthetic-client', '[]', 'null')
        .all();
  });
  it('個別JWT digest失効が別JWTへ波及しない', async () => {
    const first = jwt({ ...claims(), jti: 'one' }),
      second = jwt({ ...claims(), jti: 'two' });
    await db
      .prepare('INSERT INTO d1_oauth_revocation(token_hash,revoked_at) VALUES(?,?)')
      .bind(tokenHash(first), d1Timestamp())
      .all();
    await expect(verifyD1OAuth(request(first), db, owner, issuer, resource)).rejects.toBeTruthy();
    expect(await verifyD1OAuth(request(second), db, owner, issuer, resource)).toBeTruthy();
  });
  it.each([
    'canonical',
    'alias',
  ] as const)('署名の未使用bitだけ違うJWT aliasも同じ失効対象になる: %sを登録', async (revokedForm) => {
    const token = jwt({ ...claims(), jti: 'synthetic-signature-alias' });
    const lastDot = token.lastIndexOf('.');
    const signature = token.slice(lastDot + 1);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    // Ed25519の64byte署名は末尾base64url文字の下位4bitを使用しない。
    const alias = token.slice(0, -1) + alphabet[alphabet.indexOf(signature.at(-1) ?? '') ^ 1];
    expect(alias).not.toBe(token);
    expect(Buffer.from(alias.slice(lastDot + 1), 'base64url')).toEqual(Buffer.from(signature, 'base64url'));
    // 単に壊れた署名を拒否した負例ではなく、どちらも失効前には検証できることを確認する。
    expect(await verifyD1OAuth(request(token), db, owner, issuer, resource)).toMatchObject({ sub: owner });
    expect(await verifyD1OAuth(request(alias), db, owner, issuer, resource)).toMatchObject({ sub: owner });
    expect(tokenHash(alias)).toBe(tokenHash(token));
    await db
      .prepare('INSERT INTO d1_oauth_revocation(token_hash,revoked_at) VALUES(?,?)')
      .bind(tokenHash(revokedForm === 'alias' ? alias : token), d1Timestamp())
      .all();
    await expect(verifyD1OAuth(request(token), db, owner, issuer, resource)).rejects.toBeTruthy();
    await expect(verifyD1OAuth(request(alias), db, owner, issuer, resource)).rejects.toBeTruthy();
  });
  it.each([
    '=',
    '==',
  ])('JWT署名へのpadding追加は受理せず、padding aliasでの失効も正規形へ適用する: %s', async (padding) => {
    const token = jwt({ ...claims(), jti: 'synthetic-padding-alias' });
    const padded = token + padding;
    expect(await verifyD1OAuth(request(token), db, owner, issuer, resource)).toMatchObject({ sub: owner });
    expect(Buffer.from(padded.split('.')[2] ?? '', 'base64url')).toEqual(
      Buffer.from(token.split('.')[2] ?? '', 'base64url'),
    );
    await expect(verifyD1OAuth(request(padded), db, owner, issuer, resource)).rejects.toBeTruthy();
    expect(tokenHash(padded)).toBe(tokenHash(token));
    await db
      .prepare('INSERT INTO d1_oauth_revocation(token_hash,revoked_at) VALUES(?,?)')
      .bind(tokenHash(padded), d1Timestamp())
      .all();
    await expect(verifyD1OAuth(request(token), db, owner, issuer, resource)).rejects.toBeTruthy();
  });
  it('30日graceを超えた期限切れ公開鍵はJWT自体が未期限切れでも拒否', async () => {
    const token = jwt(claims());
    expect(await verifyD1OAuth(request(token), db, owner, issuer, resource)).toMatchObject({ sub: owner });
    await db
      .prepare('UPDATE jwks SET expires_at=? WHERE id=?')
      .bind(d1Timestamp(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)), 'synthetic-jwk')
      .all();
    await expect(verifyD1OAuth(request(token), db, owner, issuer, resource)).rejects.toBeTruthy();
    expect((await db.prepare('SELECT id FROM jwks').all()).results).toEqual([{ id: 'synthetic-jwk' }]);
  });
  it('期限切れ公開鍵でも公式30日grace内なら未期限切れJWTを受理', async () => {
    await db
      .prepare('UPDATE jwks SET expires_at=? WHERE id=?')
      .bind(d1Timestamp(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)), 'synthetic-jwk')
      .all();
    expect(await verifyD1OAuth(request(), db, owner, issuer, resource)).toMatchObject({ sub: owner });
  });
  it('ownerの署名済subでも参照sessionが別の実在userへ属すれば拒否', async () => {
    const token = jwt(claims());
    expect(await verifyD1OAuth(request(token), db, owner, issuer, resource)).toMatchObject({ sub: owner });
    await db.prepare('UPDATE session SET user_id=? WHERE id=?').bind(otherUser, 'synthetic-session').all();
    expect((await db.prepare('SELECT id,user_id FROM session').all()).results).toEqual([
      { id: 'synthetic-session', user_id: otherUser },
    ]);
    await expect(verifyD1OAuth(request(token), db, owner, issuer, resource)).rejects.toBeTruthy();
  });
  it('DPoPを元URLで一度だけ検証し、別instanceで同一proof再送を拒否', async () => {
    const token = jwt({ ...claims(), cnf: { jkt: await deriveDpopJkt(jwk) } });
    const proof = jwt(
      {
        htm: 'POST',
        htu: resource,
        iat: Math.floor(Date.now() / 1000),
        jti: 'synthetic-proof',
        ath: await deriveDpopAth(token),
      },
      { typ: 'dpop+jwt', alg: 'EdDSA', jwk },
    );
    const req = () =>
      new Request(resource, { method: 'POST', headers: { authorization: `DPoP ${token}`, dpop: proof } });
    expect(await verifyD1OAuth(req(), db, owner, issuer, resource)).toMatchObject({ sub: owner });
    await expect(verifyD1OAuth(req(), db, owner, issuer, resource)).rejects.toBeTruthy();
    await expect(verifyD1OAuth(request(token), db, owner, issuer, resource)).rejects.toBeTruthy();
  });
  it('既存tool dispatchのscopeを維持し、read JWTでwriteを拒否する', async () => {
    const req = new Request(resource, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt(claims())}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'update_company', arguments: {} },
      }),
    });
    const result = await handleD1Mcp(req, db, owner, issuer, resource);
    expect(result.status).toBe(403);
    expect(result.headers.get('www-authenticate')).toContain('insufficient_scope');
  });
});
