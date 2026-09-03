import * as Sentry from '@sentry/nextjs';

import type { SentryIntegration } from './sentry-options';

/**
 * クライアント専用ファイル。`Sentry.breadcrumbsIntegration` はブラウザビルドの輸出であり、
 * サーバービルドには存在しない。`sentry.server.config.ts` から誤って import すると
 * Turbopack のビルドが壊れるので、client 専用ファイルとして分離してある。
 *
 * クライアントの `history` breadcrumb（既定 true）は `data.to`/`data.from` に
 * `/view/技術スキルシート.md` のような実パスをそのまま記録する（罠4）。console・dom も切る。
 * fetch/xhr/sentry は残す — その `data.url` は `beforeBreadcrumb` の `scrubBreadcrumb` が
 * 二重化として route enum に丸めるので、直前の通信が分かる情報としての価値は保ちつつ安全。
 */
export function buildClientIntegrations(defaultIntegrations: SentryIntegration[]): SentryIntegration[] {
  return defaultIntegrations.map((i) =>
    i.name === 'Breadcrumbs' ? Sentry.breadcrumbsIntegration({ console: false, dom: false, history: false }) : i,
  );
}
