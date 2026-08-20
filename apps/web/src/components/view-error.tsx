import { TRPCError } from '@trpc/server';
import { notFound } from 'next/navigation';

import { type ConfigErrorKind, classifyConfigError } from '@/util/is-config-error';

import { CONFIG_ERROR_NOTICES, ConfigErrorNotice } from './config-error-notice';

/**
 * `/view` 配下の各ページが同じ形でコピーしていた「読み込み失敗の振り分け」をここに集約する。
 * 4ページに同じ判定が散っていたため、片方だけ直して案内が食い違う事故（Issue #195）が起きていた。
 *
 * ページごとに違うのは「どの TRPC コードを 404 とみなすか」だけなので、そこは引数で受ける。
 */
export function notFoundOnTrpcCodes(err: unknown, codes: readonly TRPCError['code'][]): void {
  if (err instanceof TRPCError && codes.includes(err.code)) notFound();
}

/**
 * 設定不備なら案内バナーを返し、そうでなければログを出して再スローする。
 *
 * 一律でバナーにすると、実際の障害中に監視が 200 で気づけないまま、
 * 閲覧者には的外れな設定手順だけが出る。だから一時的な障害は error.tsx / 監視へ委ねる。
 */
export function configErrorNoticeOrRethrow(err: unknown, logLabel: string): React.ReactElement {
  const kind = classifyConfigErrorOrRethrow(err, logLabel);
  return <ConfigErrorNotice {...CONFIG_ERROR_NOTICES[kind]} />;
}

/** バナーを返さず種類だけ欲しいページ（/view）向け。判定基準は上と同じ。 */
export function classifyConfigErrorOrRethrow(err: unknown, logLabel: string): ConfigErrorKind {
  const kind = classifyConfigError(err);
  if (!kind) {
    console.error(logLabel, err);
    throw err;
  }
  return kind;
}
