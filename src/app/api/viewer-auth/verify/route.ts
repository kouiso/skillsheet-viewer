import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { verifyViewerCode } from '@/lib/github';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code } = body;

    console.log('[Auth] Received code:', code ? '(provided)' : '(missing)');
    console.log('[Auth] Environment:', process.env.NODE_ENV);
    console.log('[Auth] VIEWER_CODE set:', !!process.env.VIEWER_CODE);

    if (!code) {
      return NextResponse.json({ error: '認証コードを入力してください' }, { status: 400 });
    }

    // Verify the code
    const isValid = verifyViewerCode(code);

    console.log('[Auth] Verification result:', isValid);

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

    console.log('[Auth] Cookie set successfully');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Auth] Error:', error);
    console.error('[Auth] Error message:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      {
        error: '認証処理に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
