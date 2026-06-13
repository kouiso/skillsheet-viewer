import { type Metadata } from 'next';

import { getCachedDbSheet } from '@/server/sheets-cache';

import SheetViewClient from '../[path]/sheet-view-client';

export const metadata: Metadata = {
  title: 'エンジニアスキルシート（DB版）',
  description: 'Neon DB を正本とするスキルシートビュー',
};

export default async function DbSheetPage() {
  const sheet = await getCachedDbSheet();
  return <SheetViewClient title={sheet.title} content={sheet.content} />;
}
