import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { createServerCaller } from '@/server/trpc/caller';

import PreviewClient from './preview-client';

export const metadata: Metadata = {
  title: 'プレビュー | エンジニアスキルシート',
};

// /builder と同じ認可（DAL）を踏襲する。DATABASE_URL 参照があるため connection() で動的化。
export default async function BuilderPreviewPage() {
  await connection();
  const caller = await createServerCaller();
  const { canEdit } = await caller.auth.status();
  if (!canEdit) {
    redirect('/login?next=/builder/preview');
  }

  return <PreviewClient />;
}
