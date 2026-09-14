import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSkillSheet, getSkillSheetById, SkillSheetNotFoundError } from '@/db';
import { buildSkillSheetXlsx } from '@/lib/export/build-xlsx';
import { isEditor } from '@/server/auth-gate';
import { hasViewerSession } from '@/server/viewer-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 応募用スキルシートの xlsx 出力。閲覧者（HMAC cookie）と編集者のどちらも許可する
 * （PDF 出力と同じく、画面に出ている情報と同じ内容を別形式で渡すだけのため）。
 * id 省略時はオーナーのデフォルトシートを出力する。
 */
export async function GET(req: NextRequest) {
  if (!(await hasViewerSession(req.headers)) && !(await isEditor(req.headers))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (id !== null && !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  try {
    const sheet = id ? await getSkillSheetById(id) : await getSkillSheet();
    const buf = await buildSkillSheetXlsx(sheet.blocks);
    const filename = encodeURIComponent(`${sheet.title}.xlsx`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof SkillSheetNotFoundError) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    // 失敗の内訳（DB不通・テンプレ破損等）は呼び出し元へ返さずサーバログだけに残す
    console.error('GET /api/sheet/export.xlsx failed', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
