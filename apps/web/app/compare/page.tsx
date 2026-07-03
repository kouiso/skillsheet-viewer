import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { isValidSheetPath, SheetNotFoundError } from '@/server/github-sheets';
import { getCachedSheet } from '@/server/sheets-cache';
import { requireViewer } from '@/server/viewer-gate';

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export const metadata: Metadata = {
  title: 'スキルシート比較 | エンジニアスキルシート',
};

export default async function ComparePage({ searchParams }: PageProps) {
  // /compare は /view と同じ保護シートデータを表示するため、閲覧認証ゲートを通す
  // （未認証での比較経由バイパスを防止）。
  await requireViewer();
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
    // GitHub 連携の環境変数が未設定の場合は 500 で落とさず、原因の分かる案内を表示する。
    if (err instanceof Error && err.message.includes('Missing required GitHub env vars')) {
      return (
        <div>
          <Header title="スキルシート比較" />
          <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-3 px-4 text-center">
            <h2 className="text-2xl font-bold">比較できません</h2>
            <p className="text-muted-foreground">
              GitHub 連携が未設定のため比較できません。管理者に環境変数の設定を依頼してください。
            </p>
          </div>
        </div>
      );
    }
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
