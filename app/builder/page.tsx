import { TRPCError } from '@trpc/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { Block, SheetSummary } from '@/db';
import type { DocumentSnapshot } from '@/db/document-service';

import { createServerCaller } from '@/server/trpc/caller';
import { classifyConfigError } from '@/util/is-config-error';

import BuilderClient from './builder-client';

export const metadata: Metadata = {
  title: 'スキルシートビルダー | エンジニアスキルシート',
};

// DATABASE_URL はランタイム専用のため connection() で動的レンダリングを明示する。
export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ sheet?: string }> }) {
  await connection();
  const { sheet: sheetIdParam } = await searchParams;

  let initialBlocks: Block[] = [];
  let initialTitle = '';
  let activeSheetId = '';
  let initialRevision = '0';
  let rawSnapshot: DocumentSnapshot | undefined;
  let sheets: SheetSummary[] = [];
  // 読み込みに失敗したのか、まだ何も作っていないから空なのかを画面で区別できるようにする。
  // 以前はどちらも「空の編集画面」になり、利用者は自分の書いたものが消えたと誤解した。
  let loadFailure: 'config' | 'unknown' | 'uneditable' | 'invalid-state' | 'not-found' | null = null;

  try {
    const caller = await createServerCaller();
    const state = await caller.sheet.builderState({ sheetId: sheetIdParam });
    if (state.status === 'OK') {
      initialTitle = state.snapshot.title;
      activeSheetId = state.snapshot.sheetId;
      initialRevision = state.snapshot.revision;
      if (state.snapshot.validation.editable) initialBlocks = state.snapshot.blocks as Block[];
      else {
        loadFailure = 'uneditable';
        rawSnapshot = state.snapshot;
      }
    } else if (state.status === 'INVALID_STATE') {
      loadFailure = 'invalid-state';
    }
    sheets = state.sheets;
  } catch (err) {
    if (err instanceof TRPCError && err.code === 'UNAUTHORIZED') {
      redirect('/login?next=/builder');
    }
    // DB未設定や疎通失敗時は編集保存を止め、読取失敗を明示する。
    // ただし「読めなかった」ことは必ず画面に出す。黙って空にしない。
    loadFailure =
      err instanceof TRPCError && err.code === 'NOT_FOUND'
        ? 'not-found'
        : classifyConfigError(err)
          ? 'config'
          : 'unknown';
    console.error('Failed to load sheet for builder:', err);
  }

  return (
    // key={activeSheetId}: シート切替は searchParams のみが変わる同一ルート遷移のため、
    // key が無いと BuilderClient は再マウントされず items/title/savedRevisionRef が
    // 前のシートの値のまま残り、保存時に別シートを誤った内容で上書きしてしまう。
    <BuilderClient
      key={activeSheetId}
      initialBlocks={initialBlocks}
      initialTitle={initialTitle}
      initialRevision={initialRevision}
      sheets={sheets}
      activeSheetId={activeSheetId}
      loadFailure={loadFailure}
      rawSnapshot={rawSnapshot}
    />
  );
}
