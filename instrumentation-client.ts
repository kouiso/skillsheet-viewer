import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import { registerObservabilityHandle } from '@/lib/observability/capture';
import {
  getPostHogHost,
  getPostHogKey,
  getSentryDsn,
  isPostHogEnabled,
  isSentryEnabled,
} from '@/lib/observability/config';
import { SHARED_SENTRY_OPTIONS } from '@/lib/observability/sentry-options';
import { buildClientIntegrations } from '@/lib/observability/sentry-options.client';

// Next はクライアント計測の初期化ファイルを1本しか許さない（`instrumentation-client.ts`）ため、
// Sentry と PostHog の両方をここで初期化する。fetch/XHR を素で掴ませたいので Sentry を先に。
if (isSentryEnabled()) {
  Sentry.init({
    dsn: getSentryDsn(),
    integrations: (defaults) => buildClientIntegrations(defaults),
    ...SHARED_SENTRY_OPTIONS,
  });
}

if (isPostHogEnabled()) {
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
}

registerObservabilityHandle({
  capture(error, level, context) {
    if (isSentryEnabled()) {
      Sentry.captureException(error, {
        level,
        tags: { scope: context.scope, feature: context.feature },
        fingerprint: context.fingerprint,
      });
    }
  },
  track(event) {
    if (!isPostHogEnabled()) return;
    const { name, ...properties } = event;
    posthog.capture(name, properties);
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
