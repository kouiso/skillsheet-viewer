import type { Metadata } from 'next';
import { connection } from 'next/server';

import { ConfigErrorNotice, DB_CONFIG_NOTICE } from '@/component/config-error-notice';
import { isEditor } from '@/server/auth-gate';
import { getCachedDbSheet } from '@/server/sheets-cache';
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
    const sheet = await getCachedDbSheet();
    return (
      <SheetViewClient title={sheet.title} content={sheet.content} blocks={sheet.blocks} canEdit={await isEditor()} />
    );
  } catch (err) {
    // 設定不備（#157）は待っても直らない既知の原因なので console.error は出さない。
    // それ以外（DB接続エラー等）は一時的な障害の可能性があるのでログに残す。
    if (!isConfigError(err)) {
      console.error('Failed to load DB skill sheet:', err);
    }
    return <ConfigErrorNotice {...DB_CONFIG_NOTICE} />;
  }
}
