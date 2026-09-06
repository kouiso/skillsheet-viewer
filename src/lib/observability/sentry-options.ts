import type * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubSentryEvent } from './scrub';

/**
 * '@sentry/nextjs' は `Integration` 型を独立してエクスポートしていないため、
 * 唯一それを返す公開 API（getDefaultIntegrations）の戻り値から要素型を取り出す。
 * `getDefaultIntegrations` はクライアント・サーバー双方のビルドに存在するので、
 * この型エイリアスは（型のみの参照なので）どちらのバンドルからでも安全に import できる。
 */
export type SentryIntegration = ReturnType<typeof Sentry.getDefaultIntegrations>[number];

/**
 * プロセス（サーバーレスインスタンス）あたりの送信上限。設定不備を `onRequestError` の
 * ラップ側で落としてもなお何かの理由で連投が起きた場合の、最後のサーキットブレーカー。
 * コールドスタートごとにリセットされる（モジュールスコープの変数なので）。
 */
const MAX_EVENTS_PER_PROCESS = 20;
let sentEventCount = 0;

/**
 * サーバー用・クライアント用どちらの `Sentry.init` にも共通で渡すオプション。
 * ランタイム固有の named integration（httpIntegration / breadcrumbsIntegration）は
 * ここに置かない — 置いた瞬間、この値をクライアントバンドルへも取り込む都合上、
 * Turbopack がクライアントビルドに存在しないサーバー専用 export を要求してビルドが壊れる
 * （実際に一度壊してから ./sentry-options.server.ts / ./sentry-options.client.ts に分けた）。
 *
 * `dataCollection` オプションのキーは、ここにも各ランタイムの `Sentry.init` にも
 * **絶対に書かない**。公式ドキュメント曰く、未指定のカテゴリは指定した瞬間により許可的な既定へ
 * 倒れる（`{}` を渡すだけで cookie・user・IP・request body が軒並み ON になる）。
 * ここは「書かないこと」自体が設計なので、キーを書き足したくなったら先に理由を書くこと。
 */
export const SHARED_SENTRY_OPTIONS = {
  tracesSampleRate: 0,
  beforeBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
    // scrub.ts は SDK 型に依存しない構造的部分型で動く（テストが SDK 無しで完結する）ため、
    // ここで実 SDK 型との境界を1回だけ明示的にまたぐ。timestamp/level/type 等
    // ScrubbableBreadcrumb が知らないフィールドは元の値のまま残す。
    return { ...breadcrumb, ...scrubBreadcrumb(breadcrumb) } as Sentry.Breadcrumb;
  },
  beforeSend(event: Sentry.ErrorEvent) {
    if (sentEventCount >= MAX_EVENTS_PER_PROCESS) return null;
    sentEventCount += 1;
    return { ...event, ...scrubSentryEvent(event) } as Sentry.ErrorEvent;
  },
} satisfies Partial<Sentry.NodeOptions & Sentry.BrowserOptions>;
