import { createHash } from 'node:crypto';
import { decodeBasicCredentials } from 'better-auth/oauth2';
import type { D1Binding } from '../src/db/d1/binding';
import { d1Timestamp } from '../src/db/d1/value';

const storedToken = (token: string) => createHash('sha256').update(token).digest('base64url');
const denied = () =>
  Response.json({ error: 'invalid_grant' }, { status: 400, headers: { 'cache-control': 'no-store' } });

/** Providerの複数statementにまたがるfamily失効をD1の永続境界で補強する。 */
export async function consistentOAuth(
  request: Request,
  db: D1Binding,
  owner: string,
  handler: (request: Request) => Promise<Response>,
) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'POST' || !['/api/auth/oauth2/token', '/api/auth/oauth2/revoke'].includes(path))
    return handler(request);
  // 公式token/revoke endpointはformのみ。その他はProvider自身に拒否させる。
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded')
    return handler(request);
  const text = await request.clone().text();
  if (text.length > 65536) return denied();
  const form = new URLSearchParams(text);
  for (const field of ['grant_type', 'refresh_token', 'token', 'client_id', 'client_secret', 'token_type_hint']) {
    if (form.getAll(field).length > 1) return denied();
  }
  let clientId = form.get('client_id');
  if (!clientId) {
    try {
      clientId = decodeBasicCredentials(request.headers.get('authorization') ?? '').clientId;
    } catch {
      /* Providerが不正credentialを拒否する。 */
    }
  }
  const refresh = path.endsWith('/token') && form.get('grant_type') === 'refresh_token';
  const token = form.get(refresh ? 'refresh_token' : 'token');
  if (!token) return handler(request);
  const result = await db
    .prepare('SELECT id,client_id,user_id,session_id,created_at FROM oauth_refresh_token WHERE token=?')
    .bind(storedToken(token))
    .all();
  const source = result.results[0];
  if (!source) return handler(request);
  async function revokeFamily() {
    const now = d1Timestamp(),
      seconds = Math.floor(Date.now() / 1000);
    await db.batch([
      db
        .prepare(`INSERT INTO d1_oauth_family(client_id,user_id,revoked_through) VALUES(?,?,?)
        ON CONFLICT(client_id,user_id) DO UPDATE SET revoked_through=max(revoked_through,excluded.revoked_through)`)
        .bind(String(source.client_id), owner, seconds),
      db
        .prepare('UPDATE oauth_refresh_token SET revoked=COALESCE(revoked,?) WHERE client_id=? AND user_id=?')
        .bind(now, String(source.client_id), owner),
      db
        .prepare('UPDATE oauth_access_token SET revoked=COALESCE(revoked,?) WHERE client_id=? AND user_id=?')
        .bind(now, String(source.client_id), owner),
    ]);
  }
  if (refresh) {
    const active = await db
      .prepare(`SELECT 1 AS active FROM session s WHERE id=? AND user_id=? AND expires_at>?
      AND NOT EXISTS(SELECT 1 FROM d1_oauth_family WHERE client_id=? AND user_id=? AND revoked_through>=?)`)
      .bind(
        String(source.session_id ?? ''),
        owner,
        d1Timestamp(),
        String(source.client_id),
        owner,
        Math.floor(Date.parse(String(source.created_at)) / 1000),
      )
      .all();
    if (source.user_id !== owner || !active.success || active.results.length !== 1) return denied();
  }
  const response = await handler(request);
  if (!response.ok) {
    // 旧refresh再利用によるProviderのfamily削除は400応答。実際にsourceが消えた
    // 場合だけ永続cutoffへ結び、credential失敗だけで他のtokenを失効させない。
    if (refresh && source.user_id === owner && clientId === source.client_id) {
      const remaining = await db.prepare('SELECT id FROM oauth_refresh_token WHERE id=?').bind(String(source.id)).all();
      if (remaining.success && remaining.results.length === 0) await revokeFamily();
    }
    return response;
  }
  if (refresh) {
    // revokeと同時に進んだ発行も、その結果を呼出元へ返す前に再確認する。
    const revoked = await db
      .prepare('SELECT 1 AS revoked FROM d1_oauth_family WHERE client_id=? AND user_id=? AND revoked_through>=?')
      .bind(String(source.client_id), owner, Math.floor(Date.parse(String(source.created_at)) / 1000))
      .all();
    if (!revoked.success || revoked.results.length) return denied();
  } else {
    // credential/client照合は公式Providerに任せ、成功後だけ既存familyを失効する。
    // client_idを偽装した成功応答(unknown tokenに対するRFC7009の200)を採用しない。
    if (source.user_id !== owner || clientId !== source.client_id) return response;
    await revokeFamily();
  }
  return response;
}
