import type { Metadata } from 'next';
import { connection } from 'next/server';

import { configErrorNoticeOrRethrow } from '@/components/view-error';
import { createServerCaller } from '@/server/trpc/caller';

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
    const caller = await createServerCaller();
    // auth.status() はシート取得の入力に使わないため、直列待機せず並列で開始する。
    const [{ canEdit }, sheet] = await Promise.all([caller.auth.status(), caller.sheet.getDefault()]);
    return (
      <SheetViewClient
        title={sheet.title}
        content={sheet.content}
        blocks={sheet.blocks}
        canEdit={canEdit}
        stale={sheet.stale}
      />
    );
  } catch (err) {
    // #157: 待っても直らない設定不備は 200 ＋ 原因と対処を返し、一時的な障害は再スローする。
    // 判定と案内は 4 ページ共通なので configErrorNoticeOrRethrow に集約している。
    return configErrorNoticeOrRethrow(err, 'Failed to load DB skill sheet:');
  }
}
