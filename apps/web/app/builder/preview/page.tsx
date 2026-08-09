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

  let canEdit: boolean;
  try {
    const caller = await createServerCaller();
    ({ canEdit } = await caller.auth.status());
  } catch (err) {
    // auth.status() は publicProcedure だが、SESSION_SECRET 未設定など想定外の設定不備で
    // 例外を投げうる（旧実装の isEditor() は同じ状況でも null を返すだけで例外を投げなかった）。
    // 未認可扱いにしてログインへ送るのが builder/page.tsx の UNAUTHORIZED 分岐と一貫する。
    console.error('Failed to resolve auth status for builder preview:', err);
    redirect('/login?next=/builder/preview');
  }
  if (!canEdit) {
    redirect('/login?next=/builder/preview');
  }

  return <PreviewClient />;
}
