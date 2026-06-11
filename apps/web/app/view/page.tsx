import { type Metadata } from 'next';

import { type SheetMeta } from '@/server/github-sheets';
import { getCachedSheets } from '@/server/sheets-cache';

import SheetsListClient from './sheets-list-client';

export const metadata: Metadata = {
  title: 'スキルシート一覧 | エンジニアスキルシート',
};

export default async function SheetsListPage() {
  let sheets: SheetMeta[];
  try {
    sheets = await getCachedSheets();
  } catch (err) {
    console.error('Failed to fetch sheets:', err);
    sheets = [];
  }
  return <SheetsListClient initialSheets={sheets} />;
}
