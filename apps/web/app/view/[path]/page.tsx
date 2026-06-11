import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isValidSheetPath, SheetNotFoundError } from '@/server/github-sheets';
import { getCachedSheet } from '@/server/sheets-cache';

import SheetViewClient from './sheet-view-client';

interface PageProps {
  params: Promise<{ path: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // App Router の params は既にデコード済み（再 decodeURIComponent は % を含む名前で URIError を招く）。
  const { path } = await params;
  if (!isValidSheetPath(path)) return {};
  try {
    const sheet = await getCachedSheet(path);
    return {
      title: `${sheet.title} | エンジニアスキルシート`,
      openGraph: { title: sheet.title, type: 'profile' },
    };
  } catch {
    // メタデータ生成失敗はページ描画を妨げない。詳細ログは下のページ本体で出す。
    return {};
  }
}

export default async function SheetViewPage({ params }: PageProps) {
  const { path } = await params;
  if (!isValidSheetPath(path)) notFound();

  let sheet: Awaited<ReturnType<typeof getCachedSheet>>;
  try {
    sheet = await getCachedSheet(path);
  } catch (err) {
    // ファイル不在のみ 404。レートリミットやネットワーク等のシステムエラーは
    // error.tsx / 監視ツールに委ねるため再スローする。
    if (err instanceof SheetNotFoundError) notFound();
    console.error('Failed to load sheet:', path, err);
    throw err;
  }

  return <SheetViewClient title={sheet.title} content={sheet.content} />;
}
