import type { Metadata } from 'next';
import { connection } from 'next/server';
import { classifyConfigErrorOrRethrow } from '@/components/view-error';
import type { SheetSummary } from '@/db';
import { createServerCaller } from '@/server/trpc/caller';
import { isViewer } from '@/server/viewer-gate';
import type { ConfigErrorKind } from '@/util/is-config-error';

import DbSheetsListClient from './db-sheets-list-client';

export const metadata: Metadata = {
  title: 'スキルシート一覧 | エンジニアスキルシート',
};

export default async function SheetsListPage() {
  // DATABASE_URL はランタイム専用。connection() で動的レンダリングを確保する。
  await connection();
  // layout の requireViewer() と同じ判定を先に行う。App Router は layout と page を並行して
  // 描くため、リダイレクトが確定する前に page のデータ取得が走る。未認可のまま進むと
  // viewerProcedure が UNAUTHORIZED を投げ、リダイレクトの裏で毎回スタックトレースが出る
  // （＋タイミング次第でリダイレクトより 500 が勝つ）。描画は layout の redirect に譲る。
  if (!(await isViewer())) return null;

  let sheets: SheetSummary[] = [];
  let stale = false;
  let errorKind: ConfigErrorKind | null = null;
  let canEdit = false;
  try {
    const caller = await createServerCaller();
    ({ canEdit } = await caller.auth.status());
    ({ sheets, stale } = await caller.sheet.list());
  } catch (err) {
    // #157: 待っても直らない設定不備（未設定・未マイグレーション・書式ミス等）は
    // 200 ＋ 原因と対処を返す。種類まで判定し、他の DB 正本経路
    // （/view/db・/view/db/[id]）と同じ CONFIG_ERROR_NOTICES を出す（Codex レビュー指摘:
    // 以前は isConfigError の真偽値だけを見ており、書式ミス（db-malformed-url）等でも
    // 常に「未設定」向けの汎用文言しか出せず、他の経路と案内が食い違っていた）。
    errorKind = classifyConfigErrorOrRethrow(err, 'Failed to fetch DB sheets:');
  }
  return <DbSheetsListClient initialSheets={sheets} errorKind={errorKind} canEdit={canEdit} stale={stale} />;
}
