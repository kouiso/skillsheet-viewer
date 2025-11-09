import { getServerSession } from 'next-auth';

import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import type { NextRequest } from 'next/server';

const codeSchema = z.object({
  code: z.string().min(4, '認証コードは4文字以上で入力してください'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { code } = codeSchema.parse(body);

    // 既存のコードをすべて削除
    await prisma.viewerAuth.deleteMany();

    // 新しいコードをハッシュ化して保存
    const hashedCode = await bcrypt.hash(code, 10);
    await prisma.viewerAuth.create({
      data: { code: hashedCode },
    });

    return NextResponse.json({ message: '認証コードを保存しました' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0].message }, { status: 400 });
    }

    console.error('Error saving viewer code:', error);
    return NextResponse.json({ message: '保存に失敗しました' }, { status: 500 });
  }
}
