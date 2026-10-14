// 実体は require-isolated-db.mjs（headless-e2e.mjs も同じ関門を使うため）。
export {
  assertIsolatedE2eEnv,
  ISOLATED_DATABASE_URL,
  ISOLATED_PRELOAD,
  ISOLATED_PROXY_PATTERN,
} from './require-isolated-db.mjs';
