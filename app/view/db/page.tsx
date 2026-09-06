import type { Metadata } from 'next';
import { connection } from 'next/server';

import { configErrorNoticeOrRethrow } from '@/components/view-error';
import { currentMonthKey } from '@/db/derived-display';
import { createServerCaller } from '@/server/trpc/caller';
import { requireViewer } from '@/server/viewer-gate';

import SheetViewClient from '../[path]/sheet-view-client';

export const metadata: Metadata = {
  title: 'エンジニアスキルシート（DB版）',
  description: 'Neon DB を正本とするスキルシートビュー',
};

export default async function DbSheetPage() {
  // DATABASE_URL はランタイム専用のため、connection() で動的レンダリングを明示する。
  // force-dynamic と異なりセグメント全体ではなくこのコンポーネント単位で動的化する。
  await connection();
  // 閲覧ゲートを page 側でも通す。layout に任せきりにできない理由が 2 つある。
  // (1) App Router は layout と page を並行して描くため、layout の redirect が確定する前に
  //     page のデータ取得が走る。未認可のまま進むと viewerProcedure が UNAUTHORIZED を投げ、
  //     リダイレクトの裏で毎回スタックトレースが出る（タイミング次第では 500 が勝つ）。
  // (2) クライアント遷移では共有 layout は再レンダリングされないので、遷移の間に閲覧 cookie が
  //     切れても layout の requireViewer() は走らない。page 側で判定しないと素通りする。
  // isViewer() を見て null を返す形だと (2) で白画面になるため、page 自身がリダイレクトする。
  await requireViewer();

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
        source="db"
        canEdit={canEdit}
        stale={sheet.stale}
        referenceMonth={currentMonthKey()}
      />
    );
  } catch (err) {
    // #157: 待っても直らない設定不備は 200 ＋ 原因と対処を返し、一時的な障害は再スローする。
    // 判定と案内は 4 ページ共通なので configErrorNoticeOrRethrow に集約している。
    return configErrorNoticeOrRethrow(err, 'Failed to load DB skill sheet:');
  }
}
