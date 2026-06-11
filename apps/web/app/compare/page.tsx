import { type Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { isValidSheetPath, SheetNotFoundError } from '@/server/github-sheets';
import { getCachedSheet } from '@/server/sheets-cache';

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export const metadata: Metadata = {
  title: 'スキルシート比較 | エンジニアスキルシート',
};

export default async function ComparePage({ searchParams }: PageProps) {
  const { a, b } = await searchParams;
  // 2件のパスが揃っていなければ一覧へ戻す（compare は a/b 前提のページ）。
  if (!a || !b || !isValidSheetPath(a) || !isValidSheetPath(b)) {
    redirect('/view');
  }

  let sheetA: Awaited<ReturnType<typeof getCachedSheet>>;
  let sheetB: Awaited<ReturnType<typeof getCachedSheet>>;
  try {
    [sheetA, sheetB] = await Promise.all([getCachedSheet(a), getCachedSheet(b)]);
  } catch (err) {
    if (err instanceof SheetNotFoundError) notFound();
    console.error('Failed to load sheets for compare:', a, b, err);
    throw err;
  }

  return (
    <div>
      <Header title="スキルシート比較" />
      <div className="flex min-h-[calc(100vh-64px)] flex-col md:flex-row">
        <div className="flex-1 border-b border-border md:border-b-0 md:border-r">
          <SkillSheetViewer skillSheet={{ title: sheetA.title, content: sheetA.content }} compareMode />
        </div>
        <div className="flex-1">
          <SkillSheetViewer skillSheet={{ title: sheetB.title, content: sheetB.content }} compareMode />
        </div>
      </div>
    </div>
  );
}
