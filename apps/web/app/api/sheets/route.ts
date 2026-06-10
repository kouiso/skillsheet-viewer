import { NextResponse } from 'next/server';

import { listSheets } from '@/server/github-sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sheets = await listSheets();
    return NextResponse.json(sheets, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('GET /api/sheets failed:', err);
    return NextResponse.json({ error: 'Failed to fetch sheets' }, { status: 500 });
  }
}
