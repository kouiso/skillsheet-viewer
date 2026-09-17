// MCP 検証プローブ: オーナーセッション + OAuth クライアント + リソース紐付けを作る。
// 別ユーザー（非オーナー）のセッションも作り、sub 不一致 403 の検証に使う。
import { randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { loadScriptEnv } from './env';

loadScriptEnv({ required: true });
const databaseUrl = process.env.DATABASE_URL;
const ownerId = process.env.SKILLSHEET_OWNER_ID;
if (!databaseUrl || !ownerId) throw new Error('DATABASE_URL / SKILLSHEET_OWNER_ID が未設定');
const sql = neon(databaseUrl);
const resource = 'http://localhost:3000/api/mcp';
const rnd = () => randomBytes(12).toString('hex');

// 非オーナーのダミーユーザー（検証後に消す）
const otherId = `probe-other-${rnd()}`;
await sql`delete from "user" where id like 'probe-other-%'`;
await sql`insert into "user" (id, email, name, email_verified) values (${otherId}, ${`probe-${rnd()}@example.test`}, 'probe other', true)`;

const mkSession = async (userId: string) => {
  const token = `probe-${randomBytes(24).toString('hex')}`;
  await sql`insert into session (id, token, user_id, expires_at, created_at, updated_at)
    values (${`sess-${rnd()}`}, ${token}, ${userId}, now() + interval '1 hour', now(), now())`;
  return token;
};

const ownerToken = await mkSession(ownerId);
const otherToken = await mkSession(otherId);

await sql`delete from oauth_client where client_id = 'local-mcp-probe'`;
await sql`insert into oauth_client (id, client_id, name, redirect_uris, scopes, token_endpoint_auth_method, disabled, skip_consent, user_id)
  values ('local-mcp-probe','local-mcp-probe','local probe',${['http://localhost:9876/callback']},${['skillsheet:read', 'skillsheet:write']},'none',false,false,${ownerId})`;
await sql`insert into oauth_resource (id, identifier, name, allowed_scopes) values ('res-local-mcp5',${resource},'local skillsheet mcp',${['skillsheet:read', 'skillsheet:write']}) on conflict do nothing`;
await sql`insert into oauth_client_resource (id, client_id, resource_id) values ('link-local-mcp5','local-mcp-probe',${resource}) on conflict do nothing`;

console.log(JSON.stringify({ ownerToken, otherToken, otherId }));
