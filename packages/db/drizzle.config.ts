import { defineConfig } from 'drizzle-kit';

// DATABASE_URL is server-only (.env / Vercel env). Never commit it to the repo.
export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
