import { NextRequest, NextResponse } from 'next/server';

import { listSheets } from '@/server/github-sheets';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sheets = await listSheets();
    return NextResponse.json(sheets, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    console.error('GET /api/sheets failed:', err);
    return NextResponse.json({ error: 'Failed to fetch sheets' }, { status: 500 });
  }
}
