import { type Block, getSkillSheet, getSkillSheetById, listSheets, type SheetSummary } from '@skillsheet/db';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { isEditor } from '@/server/auth-gate';

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
    sheets = await listSheets();

    if (sheetIdParam && sheets.some((s) => s.id === sheetIdParam)) {
      // URL パラメータで指定されたシートを読む
      const sheet = await getSkillSheetById(sheetIdParam);
      initialBlocks = sheet.blocks;
      initialTitle = sheet.title;
      activeSheetId = sheetIdParam;
    } else {
      // デフォルト: 最初のシート（シードも実行される）
      const sheet = await getSkillSheet();
      initialBlocks = sheet.blocks;
      initialTitle = sheet.title;
      // getSkillSheet はシードで作成されることがあるので再取得
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
    <BuilderClient
      key={activeSheetId}
      initialBlocks={initialBlocks}
      initialTitle={initialTitle}
      sheets={sheets}
      activeSheetId={activeSheetId}
    />
  );
}
