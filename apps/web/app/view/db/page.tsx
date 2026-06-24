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

  // DB 未マイグレーション（テーブル不在）や DATABASE_URL / SKILLSHEET_OWNER_ID 未設定でも
  // 生の 500 を出さず、対処手順を案内するフォールバック UI を表示する。
  try {
    const sheet = await getCachedDbSheet();
    return <SheetViewClient title={sheet.title} content={sheet.content} />;
  } catch (err) {
    console.error('Failed to load DB skill sheet:', err);
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
        <h2 className="text-2xl font-bold">DB版スキルシートを表示できません</h2>
        <p className="text-muted-foreground">
          データベースのセットアップが完了していない可能性があります。以下を確認してください。
        </p>
        <ul className="text-muted-foreground list-disc space-y-1 text-left text-sm">
          <li>
            環境変数 <code className="font-mono">DATABASE_URL</code> と{' '}
            <code className="font-mono">SKILLSHEET_OWNER_ID</code> を設定する
          </li>
          <li>
            マイグレーションを実行する: <code className="font-mono">pnpm db:migrate</code>
          </li>
        </ul>
      </div>
    );
  }
}
