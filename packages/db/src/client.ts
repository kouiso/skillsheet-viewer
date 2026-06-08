/**
 * Drizzle client for Neon serverless Postgres.
 *
 * Phase 1 uses the HTTP driver (`neon-http`) for single, non-interactive reads,
 * matching the previous Vercel Function implementation (zero behavior change).
 * When Better Auth lands, the auth/edit path will move to the WebSocket driver
 * (`neon-serverless`) to support interactive transactions and avoid the
 * `@neondatabase/serverless` >=1.0 tagged-template incompatibility.
 *
 * Server-only. Never import this from a Client Component.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { blocks, skillSheets } from './schema';

export type Database = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema: { skillSheets, blocks } });
}

/** Returns a Drizzle client from `DATABASE_URL`, or throws if it is not configured. */
export function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return createDb(url);
}
