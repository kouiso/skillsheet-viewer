// usage: tsx script/mcp-flow.mts <sessionToken> <scope...>
// -> stdout: access_token 。同意拒否テストでは --decline で error 応答を返す。
import { createHmac, randomBytes } from 'node:crypto';
import { loadScriptEnv } from './env';

loadScriptEnv({ required: true });

// 本番検証は MCP_BASE_URL で差し替える（例: https://skill-sheet-snowy.vercel.app）。
const BASE = process.env.MCP_BASE_URL ?? 'http://localhost:3000';
const RESOURCE = `${BASE}/api/mcp`;
const token = process.argv[2];
if (!token) throw new Error('usage: tsx script/mcp-flow.mts <sessionToken> [scope...] [--decline]');
const decline = process.argv.includes('--decline');
const scope =
  process.argv
    .slice(3)
    .filter((a) => !a.startsWith('--'))
    .join(' ') || 'skillsheet:read skillsheet:write';

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error('BETTER_AUTH_SECRET が未設定');
const signed = `${token}.${createHmac('sha256', secret).update(token).digest('base64')}`;
// better-auth は https 配下で cookie 名へ __Secure- を付ける。http と同じ名前で送ると
// 署名が正しくても session 未検出で /login へ流される。
const cookieName = BASE.startsWith('https://') ? '__Secure-better-auth.session_token' : 'better-auth.session_token';
const cookie = `${cookieName}=${signed}`;
const verifier = randomBytes(32).toString('base64url');
const { createHash } = await import('node:crypto');
const challenge = createHash('sha256').update(verifier).digest('base64url');

const qs = new URLSearchParams({
  response_type: 'code',
  client_id: 'local-mcp-probe',
  redirect_uri: 'http://localhost:9876/callback',
  scope,
  state: 's1',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  resource: RESOURCE,
});
const auth = await fetch(`${BASE}/api/auth/oauth2/authorize?${qs}`, { headers: { cookie }, redirect: 'manual' });
let loc = auth.headers.get('location') ?? '';
if (!loc) {
  const j = (await auth.json()) as { url?: string };
  loc = j.url ?? '';
}

let code: string | null = null;
if (loc.includes('code=')) {
  code = new URL(loc).searchParams.get('code');
} else if (loc.startsWith('/consent')) {
  const oauth_query = loc.split('?')[1];
  const consent = await fetch(`${BASE}/api/auth/oauth2/consent`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ accept: !decline, oauth_query }),
  });
  const j = (await consent.json()) as { url?: string; redirect?: boolean };
  if (j.url) code = new URL(j.url).searchParams.get('code');
  else {
    console.log(JSON.stringify({ consentResponse: j }));
    process.exit(0);
  }
}
if (!code) {
  console.log(JSON.stringify({ error: 'no code', loc }));
  process.exit(1);
}
if (decline) {
  console.log(JSON.stringify({ note: 'decline したのに code が返った', loc }));
  process.exit(1);
}

const tok = await fetch(`${BASE}/api/auth/oauth2/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: 'http://localhost:9876/callback',
    client_id: 'local-mcp-probe',
    code_verifier: verifier,
    resource: RESOURCE,
  }),
});
const tj = (await tok.json()) as { access_token?: string };
if (!tj.access_token) {
  console.log(JSON.stringify({ tokenError: tj }));
  process.exit(1);
}
console.log(tj.access_token);
