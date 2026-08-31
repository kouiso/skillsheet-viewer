import type { Metadata } from 'next';
import { connection } from 'next/server';

import { configErrorNoticeOrRethrow, notFoundOnTrpcCodes } from '@/components/view-error';
import { currentMonthKey } from '@/db/derived-display';
import { createServerCaller } from '@/server/trpc/caller';

import SheetViewClient from '../../[path]/sheet-view-client';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const caller = await createServerCaller();
    const sheet = await caller.sheet.byId({ id });
    return { title: `${sheet.title} | エンジニアスキルシート` };
  } catch {
    return { title: 'スキルシート | エンジニアスキルシート' };
  }
}

export default async function DbSheetByIdPage({ params }: Props) {
  await connection();

  const { id } = await params;

  try {
    const caller = await createServerCaller();
    // auth.status() はシート取得の入力に使わないため、直列待機せず並列で開始する。
    const [{ canEdit }, sheet] = await Promise.all([caller.auth.status(), caller.sheet.byId({ id })]);
    // key={id}: 別シートへ遷移してもコンポーネントを再マウントし、ビュー
    // ON/OFF トグルの state（初回マウント時に決まる）を新しいシートへ持ち越さない。
    return (
      <SheetViewClient
        key={id}
        title={sheet.title}
        content={sheet.content}
        blocks={sheet.blocks}
        canEdit={canEdit}
        stale={sheet.stale}
        referenceMonth={currentMonthKey()}
      />
    );
  } catch (err) {
    // tRPC procedure は throw を無条件で TRPCError にラップするため、元の
    // SkillSheetNotFoundError ではなく code: 'NOT_FOUND' で判定する
    // （sheet.byId 側のコメント参照）。
    // BAD_REQUEST は sheetIdInputSchema（z.uuid()）による入力検証エラー。この
    // procedure の入力は id のみなので、ここに来るのは「UUID の形式でない id」の
    // 場合に限られる。存在しない UUID と同じ 404 に合流させる（Issue #196:
    // 直前まで形式検証が無く、DB 側の型エラーがそのまま 500 として抜けていた）。
    notFoundOnTrpcCodes(err, ['NOT_FOUND', 'BAD_REQUEST']);
    // #157: 待っても直らない設定不備は 200 ＋ 原因と対処を返し、一時的な障害は再スローする。
    return configErrorNoticeOrRethrow(err, `Failed to load sheet: ${id}`);
  }
}
