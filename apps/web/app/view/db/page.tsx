import type { Metadata } from 'next';
import { connection } from 'next/server';

import { ConfigErrorNotice, DB_CONFIG_NOTICE } from '@/component/config-error-notice';
import { createServerCaller } from '@/server/trpc/caller';
import { isConfigError } from '@/util/is-config-error';

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
    const { canEdit } = await caller.auth.status();
    const sheet = await caller.sheet.getDefault();
    return <SheetViewClient title={sheet.title} content={sheet.content} blocks={sheet.blocks} canEdit={canEdit} />;
  } catch (err) {
    // #157: 待っても直らない設定不備（未設定・未マイグレーション）は 200 ＋ 原因と対処を返す。
    if (isConfigError(err)) {
      return <ConfigErrorNotice {...DB_CONFIG_NOTICE} />;
    }
    // 接続先が到達不能等の一時的な障害は、/view/db/[id] と同じ基準で error.tsx /
    // 監視ツールへ委ねる（一律で ConfigErrorNotice を返すと、実際の障害発生中に監視側が
    // 200 で気付けず、閲覧者には的外れな設定手順だけが表示されるため区別する）。
    console.error('Failed to load DB skill sheet:', err);
    throw err;
  }
}
