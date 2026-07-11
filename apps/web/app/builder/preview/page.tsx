import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { isEditor } from '@/server/auth-gate';

import PreviewClient from './preview-client';

export const metadata: Metadata = {
  title: 'プレビュー | エンジニアスキルシート',
};

// /builder と同じ認可（DAL）を踏襲する。DATABASE_URL 参照があるため connection() で動的化。
export default async function BuilderPreviewPage() {
  await connection();
  if (!(await isEditor())) {
    redirect('/login?next=/builder/preview');
  }

  return <PreviewClient />;
}
