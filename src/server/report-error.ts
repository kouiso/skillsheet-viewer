import { TRPCError } from '@trpc/server';
import { after } from 'next/server';

import { isSentryEnabled } from '@/lib/observability/config';

import { isKnownConfigError } from './known-config-error';
import { shouldLogTRPCError } from './trpc/log-error';

// tRPC のレート制限応答（総当たり防御が意図通り機能している状態）。攻撃者がロック後も
// 送り続けるだけで Sentry の無料枠（20 件）を溶かせてしまうため、例外送信からは除外する
// （レビュー指摘）。console.error 自体は shouldLogTRPCError 側の判定で維持し、
// サーバー側の攻撃ログは失わない。
const RATE_LIMIT_CODES: ReadonlySet<string> = new Set(['TOO_MANY_REQUESTS']);

/**
 * Sentry 送信だけをリクエストの生存期間内に留める。`after()` はレスポンス返却後も
 * この Promise が解決するまでサーバーレス実行環境を維持するため、応答直後に
 * インスタンスが凍結/終了して検出コードが未実行のまま送信が消える事故を防ぐ
 * （レビュー指摘: 元の fire-and-forget では captureException が呼ばれる前に切れうる）。
 * リクエストスコープ外（単体テスト等）で呼ばれた場合は `after()`自体が同期 throw するため、
 * 元の fire-and-forget にフォールバックする。
 */
function reportAsync(work: () => Promise<void>): void {
  try {
    after(work);
  } catch {
    void work();
  }
}

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

/**
 * tRPC の想定外エラーを、ログと Sentry 送信の同じ分岐から出す（ズレようがない形にする）。
 * `logArgs` は既存のログ行を一字一句そのまま維持するために呼び出し側が組み立てる
 * （3ファイルが異なる文言で厳密比較するテストを持つため、ここで文言を統一しない）。
 * 設定不備は報告しない（判定は `./known-config-error.ts`。`instrumentation.ts` と同じ関数を使う）。
 */
export function reportTRPCError(options: {
  error: unknown;
  scope: string;
  logArgs: readonly [message: string, error: unknown];
}): void {
  const code = options.error instanceof TRPCError ? options.error.code : 'INTERNAL_SERVER_ERROR';
  if (!shouldLogTRPCError(code)) return;

  console.error(...options.logArgs);

  if (isSentryEnabled() && !isKnownConfigError(options.error) && !RATE_LIMIT_CODES.has(code)) {
    reportAsync(() =>
      loadSentry()
        .then((Sentry) => {
          Sentry.captureException(options.error, { tags: { scope: options.scope } });
        })
        .catch(() => undefined),
    );
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
  reportAsync(() =>
    loadSentry()
      .then((Sentry) => {
        Sentry.captureMessage(message, { level: 'warning', tags: { scope: context.scope } });
      })
      .catch(() => undefined),
  );
}
