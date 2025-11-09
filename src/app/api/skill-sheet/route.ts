import { getServerSession } from 'next-auth';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import type { NextRequest } from 'next/server';

const skillSheetSchema = z.object({
  title: z.string().min(1, 'タイトルを入力してください'),
  content: z.string().min(1, '内容を入力してください'),
});

// GET: スキルシート取得
export async function GET() {
  try {
    const skillSheet = await prisma.skillSheet.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ skillSheet });
  } catch (error) {
    console.error('Error fetching skill sheet:', error);
    return NextResponse.json({ message: '取得に失敗しました' }, { status: 500 });
  }
}

// POST: スキルシート保存（管理者のみ）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { title, content } = skillSheetSchema.parse(body);

    // 既存のスキルシートを削除して新規作成（シンプルな実装）
    await prisma.skillSheet.deleteMany();
    const skillSheet = await prisma.skillSheet.create({
      data: { title, content },
    });

    return NextResponse.json({ skillSheet, message: '保存しました' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0].message }, { status: 400 });
    }

    console.error('Error saving skill sheet:', error);
    return NextResponse.json({ message: '保存に失敗しました' }, { status: 500 });
  }
}
