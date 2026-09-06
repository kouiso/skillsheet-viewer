import * as Sentry from '@sentry/nextjs';

import { getSentryDsn } from '@/lib/observability/config';
import { SHARED_SENTRY_OPTIONS } from '@/lib/observability/sentry-options';
import { buildServerIntegrations } from '@/lib/observability/sentry-options.server';

// `instrumentation.ts` の register() が DSN ゲートを通過した nodejs runtime でのみこのファイルを
// import するので、ここでは無条件に init してよい。
Sentry.init({
  dsn: getSentryDsn(),
  integrations: (defaults) => buildServerIntegrations(defaults),
  ...SHARED_SENTRY_OPTIONS,
});
