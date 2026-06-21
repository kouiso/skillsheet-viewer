/**
 * Drizzle client for Neon serverless Postgres.
 *
 * Uses the WebSocket driver (`neon-serverless`) so the auth/edit path (Better
 * Auth) can run interactive transactions, and to avoid the
 * `@neondatabase/serverless` >=1.0 tagged-template incompatibility of the HTTP
 * driver. The pooled `DATABASE_URL` (`-pooler` host) is expected at runtime.
 *
 * Server-only. Never import this from a Client Component.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import { account, blocks, session, skillSheets, user, verification } from './schema';

// Node (Vercel nodejs runtime) may lack a global WebSocket; wire the `ws`
// polyfill so the serverless driver can open its WebSocket connection.
if (!neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws;
}

const schema = { skillSheets, blocks, user, session, account, verification };

export type Database = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  return drizzle(new Pool({ connectionString: databaseUrl }), { schema });
}

let cachedDb: Database | null = null;

/**
 * Returns a Drizzle client from `DATABASE_URL`, or throws if it is not configured.
 * The instance is cached at module scope to reuse it across warm serverless
 * invocations (`DATABASE_URL` is fixed for the process lifetime).
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
