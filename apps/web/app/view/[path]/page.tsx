import { TRPCError } from '@trpc/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ConfigErrorNotice, GITHUB_CONFIG_NOTICE } from '@/component/config-error-notice';
import { isSheetFileName, isValidSheetPath, type SheetContent } from '@/server/github-sheets';
import { createServerCaller } from '@/server/trpc/caller';
import { isConfigError } from '@/util/is-config-error';

import SheetViewClient from './sheet-view-client';

interface PageProps {
  params: Promise<{ path: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // App Router の params は既にデコード済み（再 decodeURIComponent は % を含む名前で URIError を招く）。
  const { path } = await params;
  if (!isValidSheetPath(path) || !isSheetFileName(path)) return {};
  try {
    const caller = await createServerCaller();
    const sheet = await caller.githubSheet.byPath({ path });
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
  if (!isValidSheetPath(path) || !isSheetFileName(path)) notFound();

  let sheet: SheetContent;
  let canEdit = false;
  try {
    const caller = await createServerCaller();
    ({ canEdit } = await caller.auth.status());
    sheet = await caller.githubSheet.byPath({ path });
  } catch (err) {
    // tRPC procedure は throw を無条件で TRPCError にラップするため、元の SheetNotFoundError
    // ではなく code: 'NOT_FOUND' で判定する（githubSheet.byPath 側のコメント参照）。
    // ファイル不在のみ 404。
    if (err instanceof TRPCError && err.code === 'NOT_FOUND') notFound();
    // GitHub 連携未設定は待っても直らないので、200 で原因と対処を返す。
    // console.error は出さない（一時的な障害ではないため）（#157）。
    if (isConfigError(err)) {
      return <ConfigErrorNotice {...GITHUB_CONFIG_NOTICE} />;
    }
    // それ以外（レートリミットやネットワーク等の一時的なシステムエラー）は
    // error.tsx / 監視ツールに委ねるため再スローする。
    console.error('Failed to load sheet:', path, err);
    throw err;
  }

  // key={path}: 別シートへ遷移してもコンポーネントを再マウントし、ビュー
  // ON/OFF トグルの state（初回マウント時に決まる）を新しいシートへ持ち越さない。
  return <SheetViewClient key={path} title={sheet.title} content={sheet.content} canEdit={canEdit} />;
}
