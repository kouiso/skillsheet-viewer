import { getSkillSheet } from '@skillsheet/db';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { isEditor } from '@/server/auth-gate';

import BuilderClient from './builder-client';

export const metadata: Metadata = {
  title: 'スキルシートビルダー | エンジニアスキルシート',
};

// DATABASE_URL はランタイム専用のため connection() で動的レンダリングを明示する。
export default async function BuilderPage() {
  await connection();
  if (!(await isEditor())) {
    redirect('/viewer-auth?next=/builder');
  }

  let initialMarkdowns: string[] = [];
  try {
    const sheet = await getSkillSheet();
    initialMarkdowns = sheet.blocks.map((b) => b.data.markdown);
  } catch (err) {
    // DB/GitHub 未設定や疎通失敗時は空のビルダーから開始する（保存で作成できる）。
    console.error('Failed to load sheet for builder:', err);
  }

  return <BuilderClient initialMarkdowns={initialMarkdowns} />;
}
