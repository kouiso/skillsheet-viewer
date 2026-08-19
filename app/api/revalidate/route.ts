import { createHash, timingSafeEqual } from 'node:crypto';

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
  // 長さの早期returnはタイミング攻撃で秘密の長さを漏らすため、
  // 両方を固定長のSHA-256ハッシュにしてから比較する。
  const ha = createHash('sha256').update(a, 'utf-8').digest();
  const hb = createHash('sha256').update(b, 'utf-8').digest();
  return timingSafeEqual(ha, hb);
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

  // Route Handler は Server Action ではないため updateTag は使えない。
  // { expire: 0 } で即時失効（次リクエストはブロッキング再検証）を明示する。
  // 空の {} は expire 未指定＝即時失効の保証が無く、本番で無効化されない不具合があった。
  revalidateTag('sheets', { expire: 0 });
  return NextResponse.json({ ok: true, revalidated: 'sheets' });
}
