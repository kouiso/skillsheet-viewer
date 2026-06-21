import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * スキルシート本体。将来のマルチユーザー化を見据え owner_id を持つ
 * （#21 時点では単一オーナー前提）。owner_id は一意（1オーナー1シート）。
 */
export const skillSheets = pgTable('skill_sheets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  ownerId: text('owner_id').notNull().unique(),
  title: text('title').notNull(),
  theme: text('theme').notNull().default('light'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

/**
 * スキルシートを構成する順序付きブロック。
 * type='markdown' の data は { markdown: string }（src/lib/blocks.ts の Block と対応）。
 * (sheet_id, order) は一意（順序重複防止＋order順取得の高速化。ユニークインデックスが作られる）。
 */
export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => skillSheets.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    order: integer('order').notNull(),
    data: jsonb('data').notNull(),
  },
  (table) => [unique('blocks_sheet_id_order_unique').on(table.sheetId, table.order)],
);

/**
 * Better Auth コアテーブル（user/session/account/verification）。
 * better-auth v1.6 のデフォルト Drizzle スキーマ（単数形テーブル名）に準拠。
 * email/password 認証で使用する。drizzleAdapter はスキーマのキー名でモデルを
 * 解決するため、キー名・テーブル名とも単数（usePlural 未指定）に合わせる。
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);
