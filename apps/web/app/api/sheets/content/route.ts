import { NextRequest, NextResponse } from 'next/server';

import { fetchSheetFile, isValidSheetPath } from '@/server/github-sheets';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = req.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }
  if (!isValidSheetPath(path)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const content = await fetchSheetFile(path);
    return NextResponse.json(content, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    console.error('GET /api/sheets/content failed:', err);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}
