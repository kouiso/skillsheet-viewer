// ローカル検証専用: Neon serverless ドライバの既定経路(wss://<host>/v2?address=...)を
// そのまま受けてローカル PostgreSQL(TCP) に橋渡しする。アプリのコードは変更しない。
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import net from 'node:net';
import process from 'node:process';
import wsPkg from 'ws';

const { WebSocketServer } = wsPkg;

const STATE_DIR = process.env.SKILLSHEET_LOCAL_STACK_DIR ?? '/var/lib/postgresql/skillsheet-local-stack';

const server = createServer({
  key: readFileSync(process.env.WSS_KEY ?? `${STATE_DIR}/cert/key.pem`),
  cert: readFileSync(process.env.WSS_CERT ?? `${STATE_DIR}/cert/cert.pem`),
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const address = new URL(req.url, 'https://localhost').searchParams.get('address') ?? '';
  const [host, portStr] = address.split(':');
  const socket = net.connect({ host: host || '127.0.0.1', port: Number(portStr) || 5432 });
  socket.on('data', (d) => ws.readyState === ws.OPEN && ws.send(d));
  socket.on('error', () => ws.close());
  socket.on('close', () => ws.close());
  ws.on('message', (d) => socket.write(d));
  ws.on('close', () => socket.end());
  ws.on('error', () => socket.destroy());
});

server.listen(443, '127.0.0.1', () => console.log('wss-pg-proxy listening on 443'));
