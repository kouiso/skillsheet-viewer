import type { CaptureContext } from '@/lib/observability/capture';
import { registerObservabilityHandle } from '@/lib/observability/capture';
import {
  getPostHogHost,
  getPostHogKey,
  getSentryDsn,
  isPostHogEnabled,
  isSentryEnabled,
} from '@/lib/observability/config';
import type { ObservabilityEvent } from '@/lib/observability/event';

// Next はクライアント計測の初期化ファイルを1本しか許さない（`instrumentation-client.ts`）ため、
// Sentry と PostHog の両方をここで初期化する。
//
// SDK 本体は動的 import にする。トップレベルで静的 import すると、両方無効な環境
// （キー未設定のデプロイ・DSN を意図的に外したプレビュー環境等）でも、このファイルは
// 全ルートで必ずロードされる性質上、実行時の `if` 分岐に関わらず2つの SDK が
// クライアントバンドルにダウンロード・評価される（レビュー指摘: no-op のはずが
// バンドルサイズ・起動コストだけは常に払っていた）。
//
// 初期化が終わるまでの短い間（ダイナミック import が解決するまでの数msから数十ms）に
// 発生した capture/track はキューに積み、初期化完了後にまとめて送る。ここで単純に
// 「初期化完了後に registerObservabilityHandle する」実装にすると、ハイドレーション中の
// ごく初期の例外（例: app/providers.tsx の同期 throw）を取りこぼす窓ができてしまうため、
// ハンドル自体は同期的に登録し、送信先が無ければキューへ積む方式にした。
//
// 動的 import が失敗した場合（デプロイ直後に古い HTML が消えた chunk を参照する等）は
// その SDK を諦めてキューを捨てる。キュー自体にも上限を置く — 失敗を検知できるまでの間に
// 例外が連発すると、送り先の無いキューがページの寿命いっぱい伸び続けるため（レビュー指摘）。
let sentryClient: typeof import('@sentry/nextjs') | undefined;
let posthogClient: typeof import('posthog-js')['default'] | undefined;
let sentryUnavailable = false;
let posthogUnavailable = false;
const MAX_PENDING_ITEMS = 20;
const pendingCaptures: Array<{ error: unknown; level: 'error' | 'warning'; context: CaptureContext }> = [];
const pendingTracks: ObservabilityEvent[] = [];

registerObservabilityHandle({
  capture(error, level, context) {
    if (sentryClient) {
      sentryClient.captureException(error, {
        level,
        tags: { scope: context.scope, feature: context.feature },
        fingerprint: context.fingerprint,
      });
    } else if (!sentryUnavailable && isSentryEnabled() && pendingCaptures.length < MAX_PENDING_ITEMS) {
      pendingCaptures.push({ error, level, context });
    }
  },
  track(event) {
    if (posthogClient) {
      const { name, ...properties } = event;
      posthogClient.capture(name, properties);
    } else if (!posthogUnavailable && isPostHogEnabled() && pendingTracks.length < MAX_PENDING_ITEMS) {
      pendingTracks.push(event);
    }
  },
});

async function initSentry(): Promise<void> {
  if (!isSentryEnabled()) return;
  // integrations の組み立て（sentry-options.client.ts）も Sentry 型に依存するため、
  // SDK 本体と合わせて動的 import する。
  const [Sentry, { SHARED_SENTRY_OPTIONS }, { buildClientIntegrations }] = await Promise.all([
    import('@sentry/nextjs'),
    import('@/lib/observability/sentry-options'),
    import('@/lib/observability/sentry-options.client'),
  ]);
  Sentry.init({
    dsn: getSentryDsn(),
    integrations: (defaults) => buildClientIntegrations(defaults),
    ...SHARED_SENTRY_OPTIONS,
  });
  sentryClient = Sentry;
  for (const pending of pendingCaptures.splice(0)) {
    Sentry.captureException(pending.error, {
      level: pending.level,
      tags: { scope: pending.context.scope, feature: pending.context.feature },
      fingerprint: pending.context.fingerprint,
    });
  }
}

async function initPostHog(): Promise<void> {
  if (!isPostHogEnabled()) return;
  const { default: posthog } = await import('posthog-js');
  posthog.init(getPostHogKey() as string, {
    api_host: getPostHogHost(),
    defaults: '2026-05-30',
    capture_pageview: 'history_change',
    // 職務経歴書ページでは「クリックした要素のテキスト」が取引先名そのもの。最重要の1行。
    autocapture: false,
    disable_session_recording: true,
    capture_dead_clicks: false,
    enable_heatmaps: false,
    // 副作用で ON にされうる（例: プロジェクト側設定）ので明示的に false を書く。
    capture_exceptions: false,
    person_profiles: 'identified_only',
    // remote-config 経由のスクリプト注入による hydration mismatch を避ける。
    // 代償はサーベイ/ツールバー機能が使えなくなること（使う予定なし）。
    disable_external_dependency_loading: true,
    // $current_url/$pathname は enum 置換ではなく全イベントから denylist で落とす方針にした
    // （$pageview は enum 化の窓口を経由しない自動送信のため。ルート情報が要る場合は
    // sheet_viewed 等の手動イベントの enum プロパティを見る）。
    property_denylist: [
      '$title',
      '$referrer',
      '$current_url',
      '$pathname',
      '$initial_current_url',
      '$initial_referrer',
      '$initial_pathname',
    ],
  });
  posthogClient = posthog;
  for (const event of pendingTracks.splice(0)) {
    const { name, ...properties } = event;
    posthog.capture(name, properties);
  }
}

initSentry().catch(() => {
  sentryUnavailable = true;
  pendingCaptures.length = 0;
});
initPostHog().catch(() => {
  posthogUnavailable = true;
  pendingTracks.length = 0;
});

export function onRouterTransitionStart(url: string, navigationType: 'push' | 'replace' | 'traverse'): void {
  sentryClient?.captureRouterTransitionStart(url, navigationType);
}
