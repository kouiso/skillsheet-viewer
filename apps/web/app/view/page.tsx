import { type Metadata } from 'next';
import { unstable_cache } from 'next/cache';

import { listSheets } from '@/server/github-sheets';

import SheetsListClient from './sheets-list-client';

export const metadata: Metadata = {
  title: 'スキルシート一覧 | エンジニアスキルシート',
};

const getCachedSheets = unstable_cache(async () => listSheets(), ['sheets-list'], {
  tags: ['sheets'],
  revalidate: 3600,
});

export default async function SheetsListPage() {
  let sheets: Awaited<ReturnType<typeof listSheets>>;
  try {
    sheets = await getCachedSheets();
  } catch {
    sheets = [];
  }
  return <SheetsListClient initialSheets={sheets} />;
}
