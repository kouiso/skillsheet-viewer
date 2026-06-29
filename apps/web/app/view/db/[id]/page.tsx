import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { Metadata } from 'next';

import { getCachedDbSheetById } from '@/server/sheets-cache';

import SheetViewClient from '../../[path]/sheet-view-client';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const sheet = await getCachedDbSheetById(id);
    return { title: `${sheet.title} | エンジニアスキルシート` };
  } catch {
    return { title: 'スキルシート | エンジニアスキルシート' };
  }
}

export default async function DbSheetByIdPage({ params }: Props) {
  await connection();

  const { id } = await params;

  try {
    const sheet = await getCachedDbSheetById(id);
    return <SheetViewClient title={sheet.title} content={sheet.content} />;
  } catch (err) {
    console.error('Failed to load sheet:', id, err);
    notFound();
  }
}
