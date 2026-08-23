// ローカル検証専用: Neon serverless ドライバの既定経路(wss://<host>/v2?address=...)を
// そのまま受けてローカル PostgreSQL(TCP) に橋渡しする。アプリのコードは変更しない。
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import net from 'node:net';
import process from 'node:process';
// ws は default export ではなく named export で WebSocketServer を出す（default はWebSocket本体）。
import { WebSocketServer } from 'ws';

const STATE_DIR = process.env.SKILLSHEET_LOCAL_STACK_DIR ?? '/var/lib/postgresql/skillsheet-local-stack';

const server = createServer({
  key: readFileSync(process.env.WSS_KEY ?? `${STATE_DIR}/cert/key.pem`),
  cert: readFileSync(process.env.WSS_CERT ?? `${STATE_DIR}/cert/cert.pem`),
});
const wss = new WebSocketServer({ server });

// 接続先はローカルの PostgreSQL 1 つに固定する。address をそのまま net.connect へ渡すと、
// 誰でも使える無認証の TCP プロキシになり、ローカルの別サービスや外部へ中継できてしまう。
const PG_PORT = Number(process.env.PG_PORT ?? 5432);

wss.on('connection', (ws, req) => {
  const address = new URL(req.url, 'https://localhost').searchParams.get('address') ?? '';
  const [host, portStr] = address.split(':');
  const port = Number(portStr) || PG_PORT;
  if ((host && host !== '127.0.0.1' && host !== 'localhost') || port !== PG_PORT) {
    console.error(`rejected target: ${address}`);
    ws.close();
    return;
  }
  const socket = net.connect({ host: '127.0.0.1', port: PG_PORT });
  socket.on('data', (d) => ws.readyState === ws.OPEN && ws.send(d));
  socket.on('error', () => ws.close());
  socket.on('close', () => ws.close());
  ws.on('message', (d) => socket.write(d));
  ws.on('close', () => socket.end());
  ws.on('error', () => socket.destroy());
});

server.listen(443, '127.0.0.1', () => console.log('wss-pg-proxy listening on 443'));
