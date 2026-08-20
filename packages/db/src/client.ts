// クライアントバンドルに巻き込まれた瞬間にビルドを失敗させる。
// これまでは「Client Component から import しないこと」というコメントだけが頼りで、
// 誤って読み込んでも誰も気づけなかった（秘密情報の露出・巨大ドライバの同梱に直結する）。
// DB 接続。DATABASE_URL を読む。
import 'server-only';

/**
 * Neon serverless Postgres 用の Drizzle クライアント。
 *
 * 認証・編集パス（Better Auth）でインタラクティブなトランザクションを実行できるよう、
 * また HTTP ドライバでの `@neondatabase/serverless` >=1.0 のタグ付きテンプレート非互換を
 * 避けるため、WebSocket ドライバ（`neon-serverless`）を使用する。実行時にはプール接続用の
 * `DATABASE_URL`（`-pooler` ホスト）を前提とする。
 *
 * サーバー専用。Client Component からは決して import しないこと。
 */
import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import { account, blocks, realVolumeDemoFixtures, session, skillSheets, user, verification } from './schema';

// Node（Vercel nodejs runtime）にはグローバル WebSocket が無い場合があるため、
// serverless ドライバが WebSocket 接続を張れるよう `ws` ポリフィルを設定する。
if (!neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws;
}

const schema = { skillSheets, blocks, realVolumeDemoFixtures, user, session, account, verification };

export type Database = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  return drizzle(new Pool({ connectionString: databaseUrl }), { schema });
}

let cachedDb: Database | null = null;

/**
 * `DATABASE_URL` から Drizzle クライアントを返す。未設定の場合は例外を投げる。
 * warm な serverless 呼び出し間で再利用できるよう、モジュールスコープでインスタンスを
 * キャッシュする（`DATABASE_URL` はプロセスの生存期間中は固定のため）。
 */
export function getDb(): Database {
  if (cachedDb) {
    return cachedDb;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  cachedDb = createDb(url);
  return cachedDb;
}
