import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * スキルシート本体。将来のマルチユーザー化を見据え owner_id を持つ
 * （#21 時点では単一オーナー前提）。
 */
export const skillSheets = pgTable('skill_sheets', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  theme: text('theme').notNull().default('light'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

/**
 * スキルシートを構成する順序付きブロック。
 * type='markdown' の data は { markdown: string }（src/lib/blocks.ts の Block と対応）。
 */
export const blocks = pgTable('blocks', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sheetId: uuid('sheet_id')
    .notNull()
    .references(() => skillSheets.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  order: integer('order').notNull(),
  data: jsonb('data').notNull(),
})
