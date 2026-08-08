import type { SheetSummary } from '@skillsheet/db';
import type { Metadata } from 'next';
import { connection } from 'next/server';

import { createServerCaller } from '@/server/trpc/caller';
import { isConfigError } from '@/util/is-config-error';

import DbSheetsListClient from './db-sheets-list-client';

export const metadata: Metadata = {
  title: 'スキルシート一覧 | エンジニアスキルシート',
};

export default async function SheetsListPage() {
  // DATABASE_URL はランタイム専用。connection() で動的レンダリングを確保する。
  await connection();

  let sheets: SheetSummary[] = [];
  let hasError = false;
  let canEdit = false;
  try {
    const caller = await createServerCaller();
    ({ canEdit } = await caller.auth.status());
    sheets = await caller.sheet.list();
  } catch (err) {
    // #157: 待っても直らない設定不備（未設定・未マイグレーション）は 200 ＋ 原因と対処を返す。
    if (!isConfigError(err)) {
      // 接続先が到達不能等の一時的な障害は、/view/db・/view/db/[id] と同じ基準で
      // error.tsx / 監視ツールへ委ねる（一律で hasError の案内バナーにすると、実際の
      // 障害発生中に監視側が 200 で気付けず、閲覧者には的外れな設定手順だけが表示されるため）。
      console.error('Failed to fetch DB sheets:', err);
      throw err;
    }
    hasError = true;
  }
  return <DbSheetsListClient initialSheets={sheets} hasError={hasError} canEdit={canEdit} />;
}
