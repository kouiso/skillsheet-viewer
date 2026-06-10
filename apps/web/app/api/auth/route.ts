import { createHash, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { createSessionToken, getSessionCookieOptions } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const viewerCode = process.env.VIEWER_CODE ?? process.env.VITE_VIEWER_CODE;
  if (!viewerCode) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let code: unknown;
  try {
    const body = (await req.json()) as { code?: unknown };
    code = body.code;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof code !== 'string') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const codeHash = createHash('sha256').update(code, 'utf-8').digest();
  const validHash = createHash('sha256').update(viewerCode, 'utf-8').digest();

  if (!timingSafeEqual(codeHash, validHash)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const { name, ...options } = getSessionCookieOptions();
  res.cookies.set(name, createSessionToken(), options);
  return res;
}
