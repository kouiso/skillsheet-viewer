import { type Block, getSkillSheet } from '@skillsheet/db';
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
    redirect('/login?next=/builder');
  }

  let initialBlocks: Block[] = [];
  let initialTitle = '';
  try {
    const sheet = await getSkillSheet();
    // 型情報（table ブロック含む）を保持したまま渡す。markdown を抜き出して捨てない。
    initialBlocks = sheet.blocks;
    initialTitle = sheet.title;
  } catch (err) {
    // DB/GitHub 未設定や疎通失敗時は空のビルダーから開始する（保存で作成できる）。
    console.error('Failed to load sheet for builder:', err);
  }

  return <BuilderClient initialBlocks={initialBlocks} initialTitle={initialTitle} />;
}
