// e2e 専用 DB（script/e2e-isolated-db.sh が立てる）への橋渡しを起動し、終了シグナルまで保つ。
// アプリの @neondatabase/serverless は WebSocket でしか DB に入れないため、
// Unix ソケットの手前に 127.0.0.1 の WebSocket を置く。待ち受けのパスは推測できない一度きりの token。
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { startIsolatedDbBridge } from './isolated-db-bridge';

async function main() {
  const dir = process.argv[2];
  if (!dir || !isAbsolute(dir)) throw new Error('E2E_DB_DIRECTORY_REQUIRED');
  const bridge = await startIsolatedDbBridge(join(dir, 'sock'));
  // 止める側（e2e-isolated-db.sh の down）が、パターン照合ではなく pid で確実に止められるようにする。
  writeFileSync(join(dir, 'bridge.pid'), String(process.pid), { mode: 0o600 });
  const endpointFile = join(dir, 'proxy');
  // 後続の step が読む。書き終えてから見えるよう、一時名で書いて置き換える。
  writeFileSync(`${endpointFile}.tmp`, bridge.endpoint, { mode: 0o600 });
  renameSync(`${endpointFile}.tmp`, endpointFile);
  const stop = async () => {
    rmSync(endpointFile, { force: true });
    await bridge.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  // 親が閉じても生き続けるよう、イベントループを保つ。
  setInterval(() => {}, 1 << 30);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
