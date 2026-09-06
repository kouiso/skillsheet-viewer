import { MISSING_SERVER_ENV_PREFIX } from '@/lib/env';
import { classifyConfigError } from '@/util/is-config-error';

/**
 * 「待っても直らない設定不備」の判定を1か所に集める。
 *
 * `instrumentation.ts` の `onRequestError` と `src/server/report-error.ts` が同じ判定を持っていたが、
 * 2か所に分かれていたため片方だけが SESSION_SECRET / VIEWER_CODE / REVALIDATE_SECRET の文言を
 * 知る状態になっていた（レビュー指摘）。次の設定不備文言を足すときは、このファイルだけを直す。
 *
 * 設定不備を Sentry へ送らない理由: 環境変数が1つ欠けた状態で本番にクローラが来ると
 * 全リクエストが同じ原因で落ち続け、5,000 件/月の無料枠を1日で溶かす。対処は環境変数の
 * 設定であって障害対応ではないので、`app/global-error.tsx` が warning レベルで1回だけ拾う。
 */

// route handler は `assertServerEnv()` を通さないため、VIEWER_CODE / SESSION_SECRET の欠落は
// auth.login やセッション署名の中で初めて個別のエラーとして顕在化する。文言の正本はここに置き、
// 投げる側（session.ts / trpc/router/auth.ts / trpc/router/maintenance.ts）がここから import する
// （逆向きに import すると report-error.ts → auth.ts → viewer-rate-limit.ts → report-error.ts の循環になる）。
export const SESSION_SECRET_MISSING_MESSAGE = 'SESSION_SECRET is not set';
export const VIEWER_AUTH_NOT_CONFIGURED_MESSAGE = 'viewer authentication is not configured';
// `maintenance.revalidate` が投げる、GitHub/DB 系とは別系統の「任意環境変数が未設定」エラー。
// REVALIDATE_SECRET は REQUIRED_SERVER_ENV に無い任意変数なので env.ts 側の判定を素通りする。
export const REVALIDATE_SECRET_MISSING_MESSAGE = 'REVALIDATE_SECRET is not configured';

const KNOWN_CONFIG_ERROR_MESSAGES: ReadonlySet<string> = new Set([
  REVALIDATE_SECRET_MISSING_MESSAGE,
  SESSION_SECRET_MISSING_MESSAGE,
  VIEWER_AUTH_NOT_CONFIGURED_MESSAGE,
]);

/**
 * `classifyConfigError()`（GitHub/DB 系）、`assertServerEnv()` の欠落メッセージ、
 * 個別 route の設定不備メッセージの3系統すべてを見る。片方だけだと env 起因の
 * 全リクエスト失敗が無料枠を溶かす。
 */
export function isKnownConfigError(error: unknown): boolean {
  if (classifyConfigError(error) !== null) return true;
  if (!(error instanceof Error)) return false;
  return error.message.startsWith(MISSING_SERVER_ENV_PREFIX) || KNOWN_CONFIG_ERROR_MESSAGES.has(error.message);
}
