import { defineConfig } from 'drizzle-kit'

// DATABASE_URL はサーバ専用（.env / Vercel 環境変数）。リポジトリにはコミットしない。
export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
