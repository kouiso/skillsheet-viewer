import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

const SESSION_DURATION = 7 * 24 * 60 * 60;

interface SessionPayload {
  iat: number;
  exp: number;
}

function getSecret(): Buffer {
  const secret = process.env['SESSION_SECRET'];
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return Buffer.from(secret, 'utf-8');
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createSessionCookie(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { iat: now, exp: now + SESSION_DURATION };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(payloadB64);
  const token = `${payloadB64}.${sig}`;

  const isProduction =
    process.env['VERCEL_ENV'] === 'production' || process.env['VERCEL_ENV'] === 'preview';
  const secureFlag = isProduction ? '; Secure' : '';

  return `session=${token}; HttpOnly${secureFlag}; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION}`;
}

export function verifySession(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;

  const match = /(?:^|;\s*)session=([^;]+)/.exec(cookieHeader);
  if (!match?.[1]) return false;

  const token = match[1];
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const payloadB64 = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);
  const expectedSig = sign(payloadB64);

  try {
    const a = Buffer.from(providedSig, 'base64url');
    const b = Buffer.from(expectedSig, 'base64url');
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as SessionPayload;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function clearSessionCookie(): string {
  return 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
}
