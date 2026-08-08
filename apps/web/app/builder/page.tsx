import type { Block, SheetSummary } from '@skillsheet/db';
import { TRPCError } from '@trpc/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { createServerCaller } from '@/server/trpc/caller';

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
  let sheets: SheetSummary[] = [];

  try {
    const caller = await createServerCaller();
    const state = await caller.sheet.builderState({ sheetId: sheetIdParam });
    initialBlocks = state.sheet.blocks;
    initialTitle = state.sheet.title;
    activeSheetId = state.activeSheetId;
    sheets = state.sheets;
  } catch (err) {
    if (err instanceof TRPCError && err.code === 'UNAUTHORIZED') {
      redirect('/login?next=/builder');
    }
    // DB/GitHub 未設定や疎通失敗時は空のビルダーから開始する（保存で作成できる）。
    console.error('Failed to load sheet for builder:', err);
  }

  return (
    // key={activeSheetId}: シート切替は searchParams のみが変わる同一ルート遷移のため、
    // key が無いと BuilderClient は再マウントされず items/title/savedUpdatedAtRef が
    // 前のシートの値のまま残り、保存時に別シートを誤った内容で上書きしてしまう。
    <BuilderClient
      key={activeSheetId}
      initialBlocks={initialBlocks}
      initialTitle={initialTitle}
      sheets={sheets}
      activeSheetId={activeSheetId}
    />
  );
}
