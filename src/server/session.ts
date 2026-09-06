// クライアントバンドルに巻き込まれた瞬間にビルドを失敗させる。
// これまでは「Client Component から import しないこと」というコメントだけが頼りで、
// 誤って読み込んでも誰も気づけなかった（秘密情報の露出・巨大ドライバの同梱に直結する）。
// 閲覧 cookie の HMAC 署名。SESSION_SECRET を読む。
import 'server-only';

import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { SESSION_SECRET_MISSING_MESSAGE } from './known-config-error';

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const SESSION_COOKIE_NAME = 'session';

interface SessionPayload {
  iat: number;
  exp: number;
}

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error(SESSION_SECRET_MISSING_MESSAGE);
  return Buffer.from(secret, 'utf-8');
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createSessionToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { iat: now, exp: now + SESSION_DURATION_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;

  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const payloadB64 = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);
  const expectedSig = sign(payloadB64);

  try {
    const provided = Buffer.from(providedSig, 'base64url');
    const expected = Buffer.from(expectedSig, 'base64url');
    if (provided.length !== expected.length) return false;
    if (!timingSafeEqual(provided, expected)) return false;
  } catch {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as SessionPayload;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function getSessionCookieOptions() {
  // Vercel では VERCEL_ENV を優先。非 Vercel 環境では APP_ENV / NODE_ENV を見る。
  const env = process.env.VERCEL_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV;
  const secure = env === 'production' || env === 'preview';
  return {
    httpOnly: true,
    maxAge: SESSION_DURATION_SECONDS,
    name: SESSION_COOKIE_NAME,
    path: '/',
    // Strict だと「メール/Slack/ATS に貼られた共有リンクを踏む」というこのプロダクトの
    // 唯一の配布経路が、まさに cross-site のトップレベル遷移になるため cookie が付かない。
    // 有効な 7 日間セッションを持つ受け取り手が、メールを開くたび毎回 /viewer-auth に
    // 差し戻される不具合として実測された。
    //
    // CSRF はこの cookie の SameSite ではなく isSameOriginRequest（auth.ts）が
    // Origin/Host 一致を別途強制することで塞がれている（login/logout の
    // requireHttpMutationContext 経由）。この cookie で通せる viewerProcedure は
    // sheet.list/byId/getDefault・github-sheet.list/byPath の query のみで、
    // 書き込みは一切無い（sheet.ts の save/create/delete は editorProcedure）。
    // Lax は cross-site の POST やサブリソース経由の cookie 送出は引き続き止めるため、
    // ここを Strict → Lax にしても新たに開く攻撃面は無い。
    sameSite: 'lax' as const,
    secure,
  };
}

/** Cookie 属性の SameSite 値（先頭大文字）。getSessionCookieOptions() を唯一の正本にする。 */
function sameSiteCookieAttribute(): string {
  const { sameSite } = getSessionCookieOptions();
  return `SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`;
}

/** tRPC の Fetch adapter が返す Headers へ閲覧セッション cookie を追加する。 */
export function appendSessionCookie(headers: Headers): void {
  const { name, ...options } = getSessionCookieOptions();
  const parts = [
    `${name}=${createSessionToken()}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    'HttpOnly',
    sameSiteCookieAttribute(),
  ];
  if (options.secure) parts.push('Secure');
  headers.append('set-cookie', parts.join('; '));
}

/** 閲覧セッション cookie を同じ Path で失効させる。 */
export function appendExpiredSessionCookie(headers: Headers): void {
  headers.append('set-cookie', `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; ${sameSiteCookieAttribute()}`);
}

export { SESSION_COOKIE_NAME };
