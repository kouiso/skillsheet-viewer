import type { SheetSummary } from '@skillsheet/db';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { isEditor } from '@/server/auth-gate';
import { getCachedDbSheets } from '@/server/sheets-cache';
import { isConfigError } from '@/util/is-config-error';

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
    // 設定不備（#157）は待っても直らない既知の原因なので console.error は出さない。
    if (!isConfigError(err)) {
      console.error('Failed to fetch DB sheets:', err);
    }
    hasError = true;
  }
  return <DbSheetsListClient initialSheets={sheets} hasError={hasError} canEdit={await isEditor()} />;
}
