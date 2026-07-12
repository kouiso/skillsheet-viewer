import { SkillSheetNotFoundError } from '@skillsheet/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

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
    // key={id}: 別シートへ遷移してもコンポーネントを再マウントし、ビュー
    // ON/OFF トグルの state（初回マウント時に決まる）を新しいシートへ持ち越さない。
    return <SheetViewClient key={id} title={sheet.title} content={sheet.content} blocks={sheet.blocks} />;
  } catch (err) {
    if (err instanceof SkillSheetNotFoundError) {
      notFound();
    }
    // DB接続エラー等のシステムエラーは 404 で隠さず再スローし、error.tsx に委ねる。
    console.error('Failed to load sheet:', id, err);
    throw err;
  }
}
