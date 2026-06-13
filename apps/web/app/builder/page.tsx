import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSkillSheet } from '@skillsheet/db';

import { isEditor } from '@/server/auth-gate';

import BuilderClient from './builder-client';

export const metadata: Metadata = {
  title: 'スキルシートビルダー | エンジニアスキルシート',
};

// cookies() に依存するため動的レンダリング（ビルド時プリレンダ対象外）。
export default async function BuilderPage() {
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
