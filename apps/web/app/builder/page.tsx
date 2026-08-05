import { type Block, listSheets, type SheetSummary } from '@skillsheet/db';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { isEditor } from '@/server/auth-gate';
import { createServerCaller } from '@/server/trpc/caller';

import BuilderClient from './builder-client';

export const metadata: Metadata = {
  title: 'スキルシートビルダー | エンジニアスキルシート',
};

// DATABASE_URL はランタイム専用のため connection() で動的レンダリングを明示する。
export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ sheet?: string }> }) {
  await connection();
  if (!(await isEditor())) {
    redirect('/login?next=/builder');
  }

  const { sheet: sheetIdParam } = await searchParams;

  let initialBlocks: Block[] = [];
  let initialTitle = '';
  let activeSheetId = '';
  let sheets: SheetSummary[] = [];

  try {
    const caller = await createServerCaller();
    sheets = await caller.sheet.list();

    if (sheetIdParam && sheets.some((s) => s.id === sheetIdParam)) {
      // URL パラメータで指定されたシートを読む
      const sheet = await caller.sheet.byId({ id: sheetIdParam });
      initialBlocks = sheet.blocks;
      initialTitle = sheet.title;
      activeSheetId = sheetIdParam;
    } else {
      // デフォルト: 最初のシート（シードも実行される）
      const sheet = await caller.sheet.getDefault();
      initialBlocks = sheet.blocks;
      initialTitle = sheet.title;
      // getDefault はシードで作成されることがある。sheet.list はキャッシュ経由
      // （getCachedDbSheets, revalidate: 60s）なので、直前の sheet.list 呼び出しで
      // 空配列がキャッシュされていた場合はこの再取得でも同じ空配列が返ってしまう
      // （シード後もキャッシュタグは無効化されない）。ここは正本を直接読む。
      if (sheets.length === 0) {
        sheets = await listSheets();
      }
      activeSheetId = sheets[0]?.id ?? '';
    }
  } catch (err) {
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
