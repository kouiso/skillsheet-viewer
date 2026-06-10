import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const SESSION_COOKIE_NAME = 'session';

interface SessionPayload {
  iat: number;
  exp: number;
}

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
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
  const secure = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
  return {
    httpOnly: true,
    maxAge: SESSION_DURATION_SECONDS,
    name: SESSION_COOKIE_NAME,
    path: '/',
    sameSite: 'strict' as const,
    secure,
  };
}

export { SESSION_COOKIE_NAME };
