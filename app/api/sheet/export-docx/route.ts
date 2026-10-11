import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, getOwnerId, SkillSheetNotFoundError } from '@/db';
import { buildSkillSheetDocx } from '@/lib/export/build-docx';
import { EXPORT_EDITIONS } from '@/lib/export/edition';
import { isEditor } from '@/server/auth-gate';
import { readViewerDocument } from '@/server/document-view';
import { hasViewerSession } from '@/server/viewer-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 応募用スキルシートの docx 出力。閲覧者（HMAC cookie）と編集者のどちらも許可する
 * （PDF/xlsx 出力と同じく、画面に出ている情報と同じ内容を別形式で渡すだけのため）。
 * id 省略時はオーナーのデフォルトシートを出力する。
 * 要約版（edition=digest）は未提供 — xlsx の digest は件数畳み込みの別レイアウトで、
 * docx 側に同等の要件が決まるまでは 400 で明示的に拒否する。
 */
export async function GET(req: NextRequest) {
  if (!(await hasViewerSession(req.headers)) && !(await isEditor(req.headers))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (id !== null && !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const edition = z
    .enum(EXPORT_EDITIONS)
    .default('full')
    .safeParse(req.nextUrl.searchParams.get('edition') ?? undefined);
  if (!edition.success || edition.data !== 'full') {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  try {
    const sheet = await readViewerDocument(getDb(), getOwnerId(), id);
    const buf = await buildSkillSheetDocx(sheet.blocks, sheet.title, sheet.referenceMonth);
    const filename = encodeURIComponent(`${sheet.title}.docx`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof SkillSheetNotFoundError) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    // 失敗の内訳（DB不通等）は呼び出し元へ返さずサーバログだけに残す
    console.error('GET /api/sheet/export-docx failed', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
