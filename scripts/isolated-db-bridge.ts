import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { lstatSync } from 'node:fs';
import { connect } from 'node:net';
import { isAbsolute, join } from 'node:path';
import { WebSocketServer } from 'ws';

/** 合成DBのprivate Unixソケットだけを転送する。Nextと検証processで共用する接続口。 */
export async function startIsolatedDbBridge(directory: string) {
  if (!isAbsolute(directory)) throw new Error('PRIVATE_SOCKET_DIRECTORY_REQUIRED');
  const directoryStat = lstatSync(directory);
  if (
    !directoryStat.isDirectory() ||
    (directoryStat.mode & 0o077) !== 0 ||
    (process.getuid && directoryStat.uid !== process.getuid())
  )
    throw new Error('PRIVATE_SOCKET_DIRECTORY_REQUIRED');
  const socketPath = join(directory, '.s.PGSQL.55440');
  if (!lstatSync(socketPath).isSocket()) throw new Error('ISOLATED_DB_SOCKET_REQUIRED');
  const token = randomUUID();
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, path: `/${token}` });
  server.on('connection', (ws) => {
    const socket = connect(socketPath);
    ws.on('message', (bytes) => socket.write(Buffer.from(bytes as Buffer)));
    socket.on('data', (bytes) => {
      if (ws.readyState === ws.OPEN) ws.send(bytes);
    });
    socket.on('error', () => ws.close());
    ws.on('error', () => socket.destroy());
    ws.on('close', () => socket.destroy());
    socket.on('close', () => ws.close());
  });
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('PROXY_NOT_LISTENING');
  return {
    endpoint: `127.0.0.1:${address.port}/${token}`,
    async close() {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
