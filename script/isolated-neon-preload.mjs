// 隔離runner専用。アプリの通常起動からはimportしない。
import { createRequire } from 'node:module';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const endpoint = process.env.ISOLATED_NEON_PROXY;
if (!endpoint || !/^127\.0\.0\.1:[1-9][0-9]{0,4}\/[0-9a-f-]{36}$/.test(endpoint)) {
  throw new Error('ISOLATED_NEON_PROXY_REQUIRED');
}
const proxy = new URL(`http://${endpoint}`);
if (Number(proxy.port) > 65535) throw new Error('INVALID_ISOLATED_PROXY_PORT');
const database = new URL(process.env.DATABASE_URL ?? '');
if (
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  database.hostname !== 'localhost' ||
  database.port ||
  database.pathname !== '/postgres' ||
  database.search ||
  database.hash
) {
  throw new Error('ISOLATED_DATABASE_URL_REQUIRED');
}
// Neonはimport/requireで別実体になる。Nextの外部化とtsx双方へ同じ設定を渡す。
for (const config of [neonConfig, createRequire(import.meta.url)('@neondatabase/serverless').neonConfig]) {
  config.wsProxy = () => endpoint;
  config.useSecureWebSocket = false;
  config.forceDisablePgSSL = true;
  config.pipelineConnect = false;
  config.webSocketConstructor = ws;
}
