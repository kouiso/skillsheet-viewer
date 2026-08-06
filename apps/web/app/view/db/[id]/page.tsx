import { SkillSheetNotFoundError } from '@skillsheet/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { ConfigErrorNotice, DB_CONFIG_NOTICE } from '@/component/config-error-notice';
import { isEditor } from '@/server/auth-gate';
import { getCachedDbSheetById } from '@/server/sheets-cache';
import { isConfigError } from '@/util/is-config-error';

import SheetViewClient from '../../[path]/sheet-view-client';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const sheet = await getCachedDbSheetById(id);
    return { title: `${sheet.title} | エンジニアスキルシート` };
  } catch {
    return { title: 'スキルシート | エンジニアスキルシート' };
  }
}

export default async function DbSheetByIdPage({ params }: Props) {
  await connection();

  const { id } = await params;

  try {
    const sheet = await getCachedDbSheetById(id);
    // key={id}: 別シートへ遷移してもコンポーネントを再マウントし、ビュー
    // ON/OFF トグルの state（初回マウント時に決まる）を新しいシートへ持ち越さない。
    return (
      <SheetViewClient
        key={id}
        title={sheet.title}
        content={sheet.content}
        blocks={sheet.blocks}
        canEdit={await isEditor()}
      />
    );
  } catch (err) {
    if (err instanceof SkillSheetNotFoundError) {
      notFound();
    }
    // #157: 同じ「DB を読めない」失敗に対し、/view・/view/db は 200 ＋ 原因と対処を返すのに
    // ここ（/view/db/[id]）だけ再スローして error.tsx の「時間をおいて再度お試しください」に
    // 落ちていた。待っても直らない設定不備（未設定・未マイグレーション）と、DATABASE_URL は
    // 設定済みで接続先だけ到達不能、のどちらも DB 層の例外だけでは確実に区別できないため、
    // /view・/view/db と同じ基準（DB読み込み失敗は 404 で隠さず、かつ 500 にもしない）に揃える。
    // console.error は既知の設定不備メッセージのときだけ抑止する（一時的な障害の可能性がある
    // 残りのケースはログに残す）。
    if (!isConfigError(err)) {
      console.error('Failed to load sheet:', id, err);
    }
    return <ConfigErrorNotice {...DB_CONFIG_NOTICE} />;
  }
}
