import { TRPCError } from '@trpc/server';

import { MISSING_SERVER_ENV_PREFIX } from '@/lib/env';
import { isSentryEnabled } from '@/lib/observability/config';
import { classifyConfigError } from '@/util/is-config-error';

import { shouldLogTRPCError } from './trpc/log-error';

/**
 * `@sentry/nextjs` は動的 import にする（トップレベル import しない）。
 *
 * 理由は2つ:
 * 1. `isSentryEnabled()` が false（キー未設定・ローカル・テスト）のときに実 SDK を
 *    一切ロードしない。実測で、トップレベル import すると vitest（jsdom）配下で
 *    `@sentry/server-utils` 経由の `@apm-js-collab/code-transformer-bundler-plugins` が
 *    `import.meta.url` を file スキームと決め打ちして即座に throw し、
 *    `app/api/**` の既存テストが軒並み壊れた（Vite の変換後 URL は file スキームではない）。
 * 2. バンドラ層をまたいで Sentry ハンドルを共有できるかは実証済みでない
 *    （`src/lib/observability/capture.ts` の globalThis レジストリに頼らない理由も同じ）。
 *    SDK 自身が自前のグローバルキャリアでクライアントを解決するため、ここでは
 *    `@sentry/nextjs` を直接（ただし動的に） import する。
 */
async function loadSentry() {
  return import('@sentry/nextjs');
}

// `maintenance.revalidate` が投げる、GitHub/DB 系とは別系統の「任意環境変数が未設定」エラー。
// `classifyConfigError()` と `MISSING_SERVER_ENV_PREFIX` のどちらの文言にもマッチしないため、
// これを個別に見ないと /api/revalidate への誤 secret での呼び出しのたびに Sentry へ送られ続ける
// （レビュー指摘: REVALIDATE_SECRET は REQUIRED_SERVER_ENV に無い任意変数なので env.ts 側の
// 判定を素通りする）。
const REVALIDATE_SECRET_MISSING_MESSAGE = 'REVALIDATE_SECRET is not configured';

/**
 * 「待っても直らない設定不備」の判定。`classifyConfigError()`（GitHub/DB系）と
 * `assertServerEnv()` の欠落メッセージ（別の文言体系）の両方を見る必要がある
 * （片方だけだと env 起因の全リクエスト失敗が無料枠を1日で溶かす）。
 */
function isKnownConfigError(error: unknown): boolean {
  if (classifyConfigError(error) !== null) return true;
  if (!(error instanceof Error)) return false;
  return error.message.startsWith(MISSING_SERVER_ENV_PREFIX) || error.message === REVALIDATE_SECRET_MISSING_MESSAGE;
}

/**
 * tRPC の想定外エラーを、ログと Sentry 送信の同じ分岐から出す（ズレようがない形にする）。
 * `logArgs` は既存のログ行を一字一句そのまま維持するために呼び出し側が組み立てる
 * （3ファイルが異なる文言で厳密比較するテストを持つため、ここで文言を統一しない）。
 * 設定不備は報告しない — 環境変数が1つ欠けた状態で全リクエストが落ちると Sentry の
 * 無料枠を溶かす。設定不備自体は `app/global-error.tsx` が warning レベルで別途拾う。
 */
export function reportTRPCError(options: {
  error: unknown;
  scope: string;
  logArgs: readonly [message: string, error: unknown];
}): void {
  const code = options.error instanceof TRPCError ? options.error.code : 'INTERNAL_SERVER_ERROR';
  if (!shouldLogTRPCError(code)) return;

  console.error(...options.logArgs);

  if (isSentryEnabled() && !isKnownConfigError(options.error)) {
    void loadSentry()
      .then((Sentry) => {
        Sentry.captureException(options.error, { tags: { scope: options.scope } });
      })
      .catch(() => undefined);
  }
}

// scope+message のペアごとに、直近いつ送ったか。DB 障害時の劣化通知は「起きた」の1回だけで
// 十分で、直りもしない状態を毎リクエスト送ると障害中ほど Sentry の無料枠を早く溶かす
// （レビュー指摘: viewer-rate-limit.ts の check/reserve/clear がリクエストごとに呼ぶ）。
const degradationLastReportedAt = new Map<string, number>();
const DEGRADATION_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * セキュリティの劣化（編集者が黙って降格・総当たり防御が fail open）を warning レベルで送る。
 * バグ報告ではなく「守りが弱くなっている」信号なので、error レベルにはしない。
 * 同じ scope+message は `DEGRADATION_COOLDOWN_MS` の間に1回しか送らない。
 */
export function reportDegradation(message: string, context: { scope: string }): void {
  if (!isSentryEnabled()) return;
  const key = `${context.scope}:${message}`;
  const now = Date.now();
  const last = degradationLastReportedAt.get(key);
  if (last !== undefined && now - last < DEGRADATION_COOLDOWN_MS) return;
  degradationLastReportedAt.set(key, now);
  void loadSentry()
    .then((Sentry) => {
      Sentry.captureMessage(message, { level: 'warning', tags: { scope: context.scope } });
    })
    .catch(() => undefined);
}
