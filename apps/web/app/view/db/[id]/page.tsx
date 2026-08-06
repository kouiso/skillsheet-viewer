import { TRPCError } from '@trpc/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { createServerCaller } from '@/server/trpc/caller';

import SheetViewClient from '../../[path]/sheet-view-client';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const caller = await createServerCaller();
    const sheet = await caller.sheet.byId({ id });
    return { title: `${sheet.title} | エンジニアスキルシート` };
  } catch {
    return { title: 'スキルシート | エンジニアスキルシート' };
  }
}

export default async function DbSheetByIdPage({ params }: Props) {
  await connection();

  const { id } = await params;

  try {
    const caller = await createServerCaller();
    const sheet = await caller.sheet.byId({ id });
    // key={id}: 別シートへ遷移してもコンポーネントを再マウントし、ビュー
    // ON/OFF トグルの state（初回マウント時に決まる）を新しいシートへ持ち越さない。
    return <SheetViewClient key={id} title={sheet.title} content={sheet.content} blocks={sheet.blocks} />;
  } catch (err) {
    // tRPC procedure は throw を無条件で TRPCError にラップするため、元の
    // SkillSheetNotFoundError ではなく code: 'NOT_FOUND' で判定する
    // （sheet.byId 側のコメント参照）。
    if (err instanceof TRPCError && err.code === 'NOT_FOUND') {
      notFound();
    }
    // DB接続エラー等のシステムエラーは 404 で隠さず再スローし、error.tsx に委ねる。
    console.error('Failed to load sheet:', id, err);
    throw err;
  }
}
