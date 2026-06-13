import type { Metadata } from 'next';
import { connection } from 'next/server';

import { getCachedDbSheet } from '@/server/sheets-cache';

import SheetViewClient from '../[path]/sheet-view-client';

export const metadata: Metadata = {
  title: 'エンジニアスキルシート（DB版）',
  description: 'Neon DB を正本とするスキルシートビュー',
};

export default async function DbSheetPage() {
  // DATABASE_URL はランタイム専用のため、connection() で動的レンダリングを明示する。
  // force-dynamic と異なりセグメント全体ではなくこのコンポーネント単位で動的化する。
  await connection();
  const sheet = await getCachedDbSheet();
  return <SheetViewClient title={sheet.title} content={sheet.content} />;
}
