import * as Sentry from '@sentry/nextjs';

import type { SentryIntegration } from './sentry-options';

/**
 * サーバー専用ファイル。`Sentry.httpIntegration` は @sentry/node の輸出であり、
 * クライアントビルドには存在しない。この関数を `instrumentation-client.ts` から
 * 誤って import すると Turbopack のビルドが壊れる（実際に一度壊した）ので、
 * server 専用ファイルとして分離してある。
 *
 * サーバー側 console→breadcrumb は `breadcrumbsIntegration`（ブラウザ専用）とは別の
 * default-on integration（`consoleIntegration`、名前は `"Console"`）。ここで名前指定して外す。
 * `httpIntegration` の breadcrumbs は既定 true — GitHub API の URL（ファイル名を含む）が
 * そのまま breadcrumb に乗るのを防ぐため false にする（罠3）。
 */
export function buildServerIntegrations(defaultIntegrations: SentryIntegration[]): SentryIntegration[] {
  return defaultIntegrations
    .filter((i) => i.name !== 'Console')
    .map((i) => (i.name === 'Http' ? Sentry.httpIntegration({ breadcrumbs: false }) : i));
}
