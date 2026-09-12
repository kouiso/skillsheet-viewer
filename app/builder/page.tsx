import { TRPCError } from '@trpc/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { Block, SheetSummary } from '@/db';

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
  let initialRevision = 0;
  let sheets: SheetSummary[] = [];
  // 読み込みに失敗したのか、まだ何も作っていないから空なのかを画面で区別できるようにする。
  // 以前はどちらも「空の編集画面」になり、利用者は自分の書いたものが消えたと誤解した。
  let loadFailure: 'config' | 'unknown' | null = null;

  try {
    const caller = await createServerCaller();
    const state = await caller.sheet.builderState({ sheetId: sheetIdParam });
    initialBlocks = state.sheet.blocks;
    initialTitle = state.sheet.title;
    activeSheetId = state.activeSheetId;
    // デプロイ直後の古いキャッシュ形（revision 無し）を踏んだ場合は 0 に倒す。
    // revision=0 は DB の最小値 1 に一致せず保存時 CONFLICT となり、再読込で
    // 新しい版を取り直せる（版なしのまま進んで BAD_REQUEST ループになるより安全）。
    initialRevision = typeof state.sheet.revision === 'number' ? state.sheet.revision : 0;
    sheets = state.sheets;
  } catch (err) {
    if (err instanceof TRPCError && err.code === 'UNAUTHORIZED') {
      redirect('/login?next=/builder');
    }
    // DB/GitHub 未設定や疎通失敗時も編集画面自体は開く（保存で作成できる）。
    // ただし「読めなかった」ことは必ず画面に出す。黙って空にしない。
    loadFailure = classifyConfigError(err) ? 'config' : 'unknown';
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
    />
  );
}
