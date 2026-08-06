import type { SheetSummary } from '@skillsheet/db';
import type { Metadata } from 'next';
import { connection } from 'next/server';

import { createServerCaller } from '@/server/trpc/caller';

import DbSheetsListClient from './db-sheets-list-client';

export const metadata: Metadata = {
  title: 'スキルシート一覧 | エンジニアスキルシート',
};

export default async function SheetsListPage() {
  // DATABASE_URL はランタイム専用。connection() で動的レンダリングを確保する。
  await connection();

  let sheets: SheetSummary[] = [];
  let hasError = false;
  try {
    const caller = await createServerCaller();
    sheets = await caller.sheet.list();
  } catch (err) {
    console.error('Failed to fetch DB sheets:', err);
    hasError = true;
  }
  return <DbSheetsListClient initialSheets={sheets} hasError={hasError} />;
}
