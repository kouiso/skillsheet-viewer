import { NextRequest, NextResponse } from 'next/server';

import { fetchSheetFile, isValidSheetPath } from '@/server/github-sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('GET /api/sheets/content failed:', err);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}
