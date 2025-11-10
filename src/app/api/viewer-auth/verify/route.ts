import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { verifyViewerCode } from '@/lib/github';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: '認証コードを入力してください' }, { status: 400 });
    }

    // Verify the code
    const isValid = verifyViewerCode(code);

    if (!isValid) {
      return NextResponse.json({ error: '認証コードが正しくありません' }, { status: 401 });
    }

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set('viewer-session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Viewer auth error:', error);
    return NextResponse.json({ error: '認証処理に失敗しました' }, { status: 500 });
  }
}
