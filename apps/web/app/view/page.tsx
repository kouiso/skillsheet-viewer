import { connection } from 'next/server';
import type { Metadata } from 'next';

import type { SheetSummary } from '@skillsheet/db';
import { getCachedDbSheets } from '@/server/sheets-cache';

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
    sheets = await getCachedDbSheets();
  } catch (err) {
    console.error('Failed to fetch DB sheets:', err);
    hasError = true;
  }
  return <DbSheetsListClient initialSheets={sheets} hasError={hasError} />;
}
