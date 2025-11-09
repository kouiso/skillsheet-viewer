import { NextResponse } from 'next/server';
import { z } from 'zod';

import { verifyViewerCode, setViewerSession } from '@/lib/viewer-auth';

import type { NextRequest } from 'next/server';

const verifySchema = z.object({
  code: z.string().min(1, '認証コードを入力してください'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = verifySchema.parse(body);

    const isValid = await verifyViewerCode(code);

    if (isValid) {
      await setViewerSession();
      return NextResponse.json({ success: true, message: '認証に成功しました' });
    } else {
      return NextResponse.json({ success: false, message: '認証コードが正しくありません' }, { status: 401 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0].message }, { status: 400 });
    }

    console.error('Viewer auth error:', error);
    return NextResponse.json({ success: false, message: '認証に失敗しました' }, { status: 500 });
  }
}
