import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * スキルシート本体。将来のマルチユーザー化を見据え owner_id を持つ。
 * #50 で複数シート対応のため owner_id の unique 制約を除去し、代わりにインデックスを追加。
 *
 * is_default: 編集で既定が移動しないよう、既定シートを updated_at 昇順ではなく
 * 明示フラグで持つ（S09）。owner ごとに高々 1 枚を部分ユニーク索引で保証する。
 */
export const skillSheets = pgTable(
  'skill_sheets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    theme: text('theme').notNull().default('light'),
    isDefault: boolean('is_default').notNull().default(false),
    // created_at は「最古シート」の決定を完全に決定的にするための列。
    // updated_at は編集で変わるため、昇格・実効既定の対象決定には使わない。
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
    // DB内は64bit整数。限定APIは10進文字列で返し、JS Numberへ変換しない。
    revision: bigint('revision', { mode: 'bigint' }).notNull().default(sql`0`),
  },
  (table) => [
    check('skill_sheets_revision_nonnegative', sql`${table.revision} >= 0`),
    index('skill_sheets_owner_id_idx').on(table.ownerId),
    uniqueIndex('skill_sheets_owner_default_unique').on(table.ownerId).where(sql`${table.isDefault}`),
  ],
);

/**
 * owner 単位の初期化済みフラグ。シートとは別に永続化することで、
 * 「まだ一度も初期化していない（初回導入）」と「全シートを削除した後」を
 * 区別する（S09: 全削除後に初期データを復活させない）。
 * 明示作成・削除で行を確保する。削除済みIDは古いcreate再送による復活を防ぎ、復旧対象に含める。
 */
export const skillsheetState = pgTable('skillsheet_state', {
  ownerId: text('owner_id').primaryKey(),
  deletedSheetIds: uuid('deleted_sheet_ids').array().notNull().default(sql`'{}'::uuid[]`),
  initializedAt: timestamp('initialized_at', { withTimezone: true }).notNull().default(sql`now()`),
});

/**
 * スキルシートを構成する順序付きブロック。
 * type='markdown' の data は { markdown: string }（src/lib/block.ts の Block と対応）。
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
 * 実ボリュームデモ用のフィクスチャ管理テーブル。
 * 同名シートの並行作成を防ぐため、owner_id 単位で一意制約を持つ。
 * シート削除時はカスケード削除される。
 */
export const realVolumeDemoFixtures = pgTable(
  'real_volume_demo_fixtures',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ownerId: text('owner_id').notNull(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => skillSheets.id, { onDelete: 'cascade' }),
  },
  (table) => [unique('real_volume_demo_fixtures_owner_id_unique').on(table.ownerId)],
);

/**
 * 閲覧コード（VIEWER_CODE）の失敗試行の記録。総当たりを止めるために使う。
 *
 * Vercel の serverless はインスタンスが使い捨てで水平に増えるため、プロセス内の
 * カウンタでは並列アクセスに対して事実上ノーガードになる。回数の正本を DB に置く。
 *
 * key は「送り元 IP のハッシュ」または IP を取れない場合の固定キー。生の IP は保存しない
 * （必要なのは同一送り元かどうかの判定だけで、IP そのものは要らない）。
 */
export const viewerLoginAttempt = pgTable(
  'viewer_login_attempt',
  {
    key: text('key').primaryKey(),
    failureCount: integer('failure_count').notNull().default(0),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().default(sql`now()`),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  // 攻撃側は送り元を変えられるので、放っておくと行が増え続ける。
  // 期限切れ行の掃除（purgeExpiredViewerLoginAttempts）が全表走査にならないよう索引を張る。
  (table) => [index('viewer_login_attempt_expiry_idx').on(table.lockedUntil, table.windowStartedAt)],
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

// --- Remote MCP サーバー（Issue #305）向け OAuth 2.1 Provider テーブル群 ---
// @better-auth/mcp（= oauthProvider）+ jwt() + cimd() プラグインが要求するスキーマ。
// モデル名・フィールドは better-auth のプラグインスキーマに厳密に一致させる
// （drizzleAdapter はモデル名でテーブル、fieldName でカラムを解決する）。
// テーブル名・カラム名は既存テーブルと同じ snake_case 規約に揃える。

/**
 * jwt() プラグインの署名鍵ペア保管庫。アクセストークン（JWT）の署名・検証に使う。
 * 秘密鍵を含むため、このテーブル内容は絶対に外部へ露出させない。
 */
export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  alg: text('alg'),
  crv: text('crv'),
});

/**
 * OAuth クライアント（MCP クライアント = Claude Code / claude.ai 等）の登録情報。
 * CIMD（Client ID Metadata Document）経由で登録され、clientId は https URL になり得る。
 */
export const oauthClient = pgTable(
  'oauth_client',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('client_credentials_scopes').array().default([]),
    userId: text('user_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date()),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts').array(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types').array(),
    responseTypes: text('response_types').array(),
    requirePKCE: boolean('require_pkce'),
    dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata'),
  },
  (table) => [index('oauth_client_user_id_idx').on(table.userId)],
);

/** RFC 8707 の protected resource（このアプリでは /api/mcp）の登録情報。 */
export const oauthResource = pgTable('oauth_resource', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes').array(),
  customClaims: jsonb('custom_claims'),
  dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
  policyVersion: integer('policy_version').default(1),
  metadata: jsonb('metadata'),
});

/** OAuth クライアント ↔ protected resource のリンク（どのクライアントがどのリソースを要求できるか）。 */
export const oauthClientResource = pgTable(
  'oauth_client_resource',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('oauth_client_resource_client_id_idx').on(table.clientId),
    index('oauth_client_resource_resource_id_idx').on(table.resourceId),
    unique('oauth_client_resource_client_id_resource_id_unique').on(table.clientId, table.resourceId),
  ],
);

export const oauthRefreshToken = pgTable(
  'oauth_refresh_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => user.id),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    revoked: timestamp('revoked', { withTimezone: true }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    // ローテーション後の旧トークン再送に同じ応答を返すためのキャッシュ（replay window 30s）。
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: timestamp('rotation_replay_expires_at', { withTimezone: true }),
    authTime: timestamp('auth_time', { withTimezone: true }),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauth_refresh_token_client_id_idx').on(table.clientId),
    index('oauth_refresh_token_session_id_idx').on(table.sessionId),
    index('oauth_refresh_token_user_id_idx').on(table.userId),
    index('oauth_refresh_token_authorization_code_id_idx').on(table.authorizationCodeId),
  ],
);

export const oauthAccessToken = pgTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    // JWT アクセストークンでは token 列を持たない場合があるため nullable。
    token: text('token').unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => user.id),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    refreshId: text('refresh_id').references(() => oauthRefreshToken.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    revoked: timestamp('revoked', { withTimezone: true }),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauth_access_token_client_id_idx').on(table.clientId),
    index('oauth_access_token_session_id_idx').on(table.sessionId),
    index('oauth_access_token_user_id_idx').on(table.userId),
    index('oauth_access_token_authorization_code_id_idx').on(table.authorizationCodeId),
    index('oauth_access_token_refresh_id_idx').on(table.refreshId),
  ],
);

export const oauthConsent = pgTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId),
    userId: text('user_id').references(() => user.id),
    referenceId: text('reference_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    scopes: text('scopes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('oauth_consent_client_id_idx').on(table.clientId),
    index('oauth_consent_user_id_idx').on(table.userId),
  ],
);

/**
 * private_key_jwt クライアントアサーションの jti リプレイ防止テーブル。
 * 行 id（アサーション識別子の digest）が PK として残り続け、期限切れ行は自動削除されない
 * （増えすぎた場合は手動で expiresAt 切れを掃除する運用。プラグイン設計上の仕様）。
 */
export const oauthClientAssertion = pgTable('oauth_client_assertion', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
