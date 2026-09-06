import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { configErrorNoticeOrRethrow, notFoundOnTrpcCodes } from '@/components/view-error';
import { isSheetFileName, isValidSheetPath, type SheetContent } from '@/server/github-sheets';
import { createServerCaller } from '@/server/trpc/caller';
import { requireViewer } from '@/server/viewer-gate';

import DeferredEditSheetView from './deferred-edit-sheet-view';

interface PageProps {
  params: Promise<{ path: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // App Router の params は既にデコード済み（再 decodeURIComponent は % を含む名前で URIError を招く）。
  const { path } = await params;
  if (!isValidSheetPath(path) || !isSheetFileName(path)) return {};
  try {
    const caller = await createServerCaller();
    const sheet = await caller.githubSheet.byPath({ path });
    return {
      title: `${sheet.title} | エンジニアスキルシート`,
      openGraph: { title: sheet.title, type: 'profile' },
    };
  } catch {
    // メタデータ生成失敗はページ描画を妨げない。詳細ログは下のページ本体で出す。
    return {};
  }
}

export default async function SheetViewPage({ params }: PageProps) {
  const { path } = await params;
  if (!isValidSheetPath(path) || !isSheetFileName(path)) notFound();
  // 閲覧ゲートを page 側でも通す。layout に任せきりにできない理由が 2 つある。
  // (1) App Router は layout と page を並行して描くため、layout の redirect が確定する前に
  //     page のデータ取得が走る。未認可のまま進むと viewerProcedure が UNAUTHORIZED を投げ、
  //     リダイレクトの裏で毎回スタックトレースが出る（タイミング次第では 500 が勝つ）。
  // (2) クライアント遷移では共有 layout は再レンダリングされないので、遷移の間に閲覧 cookie が
  //     切れても layout の requireViewer() は走らない。page 側で判定しないと素通りする。
  // isViewer() を見て null を返す形だと (2) で白画面になるため、page 自身がリダイレクトする。
  await requireViewer();

  let sheet: SheetContent;
  try {
    const caller = await createServerCaller();
    // HMAC cookie を持つ閲覧者は、本文表示をローカル検証だけで進める。
    // 編集者判定はクライアント側で遅延し、Better Auth / DB の遅延や障害で
    // 閲覧者向けの本文まで待たせない。
    sheet = await caller.githubSheet.byPath({ path });
  } catch (err) {
    // tRPC procedure は throw を無条件で TRPCError にラップするため、元の SheetNotFoundError
    // ではなく code: 'NOT_FOUND' で判定する（githubSheet.byPath 側のコメント参照）。
    // ファイル不在のみ 404。
    notFoundOnTrpcCodes(err, ['NOT_FOUND']);
    // GitHub 連携の設定不備（未設定・トークン拒否）は待っても直らないので、200 で
    // 原因と対処を返す。未設定とトークン拒否（401）は原因も対処も違うため、
    // classifyConfigError() の種類ごとに別の案内文を出す（Issue #195: 従来はどちらも
    // 「未設定」の文面で案内しており、トークン拒否のときに調査を誤誘導していた）。
    // console.error は出さない（一時的な障害ではないため）（#157）。
    // 設定不備は 200 ＋ 原因と対処、一時的なシステムエラーは error.tsx / 監視へ委ねる。
    // ログ文字列にシート識別子（path）を埋め込まない — 監視基盤の
    // 送信側 breadcrumb・console キャプチャに乗る余地を発生源で断つ。
    return configErrorNoticeOrRethrow(err, 'Failed to load sheet');
  }

  // key={path}: 別シートへ遷移してもコンポーネントを再マウントし、ビュー
  // ON/OFF トグルの state（初回マウント時に決まる）を新しいシートへ持ち越さない。
  return <DeferredEditSheetView key={path} title={sheet.title} content={sheet.content} source="github" />;
}
