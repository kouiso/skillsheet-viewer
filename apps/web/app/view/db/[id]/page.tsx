import { TRPCError } from '@trpc/server';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';

import { ConfigErrorNotice, getConfigErrorNotice } from '@/component/config-error-notice';
import { createServerCaller } from '@/server/trpc/caller';
import { isUuid } from '@/util/is-uuid';

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
  if (!isUuid(id)) {
    notFound();
  }

  try {
    const caller = await createServerCaller();
    // auth.status() はシート取得の入力に使わないため、直列待機せず並列で開始する。
    const [{ canEdit }, sheet] = await Promise.all([caller.auth.status(), caller.sheet.byId({ id })]);
    // key={id}: 別シートへ遷移してもコンポーネントを再マウントし、ビュー
    // ON/OFF トグルの state（初回マウント時に決まる）を新しいシートへ持ち越さない。
    return (
      <SheetViewClient key={id} title={sheet.title} content={sheet.content} blocks={sheet.blocks} canEdit={canEdit} />
    );
  } catch (err) {
    // tRPC procedure は throw を無条件で TRPCError にラップするため、元の
    // SkillSheetNotFoundError ではなく code: 'NOT_FOUND' で判定する
    // （sheet.byId 側のコメント参照）。
    if (err instanceof TRPCError && err.code === 'NOT_FOUND') {
      notFound();
    }
    // 未認証は閲覧者ログインへ誘導。
    if (err instanceof TRPCError && err.code === 'UNAUTHORIZED') {
      redirect('/viewer-auth');
    }
    // #157/#195: 待っても直らない設定不備は 200 ＋ 原因と対処を返す。
    const notice = getConfigErrorNotice(err);
    if (notice) {
      return <ConfigErrorNotice {...notice} />;
    }
    // 接続先が到達不能等の一時的な障害は、設定不備と同じ 200 に丸めず error.tsx /
    // 監視ツールへ委ねる（isConfigError の結果をログ抑止だけに使い、どちらの場合も
    // 一律で ConfigErrorNotice を返すと、実際の障害発生中に「監視側は 200 で気付けず、
    // 閲覧者には的外れな設定手順だけが表示される」ことになるため区別する）。
    console.error('Failed to load sheet:', id, err);
    throw err;
  }
}
