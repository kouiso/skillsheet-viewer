import { timingSafeEqual } from 'node:crypto';

import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GitHub 読み経路（unstable_cache の tag 'sheets'）の on-demand 無効化。
 * DB 中心運用のため webhook ではなく手動トリガ route で簡素化（P0-4）。
 *
 * 認証: `REVALIDATE_SECRET` を `Authorization: Bearer <secret>` か `?secret=` で照合。
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf-8');
  const bb = Buffer.from(b, 'utf-8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'REVALIDATE_SECRET is not configured' }, { status: 500 });
  }

  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.nextUrl.searchParams.get('secret') ?? '';

  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Next 16 の revalidateTag は第2引数必須。空 CacheLifeConfig で即時失効。
  revalidateTag('sheets', {});
  return NextResponse.json({ ok: true, revalidated: 'sheets' });
}
