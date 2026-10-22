import { customType, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { d1Timestamp } from './value';

// 既存Better Auth/OAuthの列名を維持。日時はUTC ISO、booleanは0/1、配列/JSONはTEXT。
const isoDate = customType<{ data: Date; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => d1Timestamp(value),
  fromDriver: (value) => new Date(value),
});

export const user = sqliteTable('user', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: isoDate('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: isoDate('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey().notNull(),
  expiresAt: isoDate('expires_at').notNull(),
  token: text('token').notNull(),
  createdAt: isoDate('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: isoDate('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull(),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey().notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: isoDate('access_token_expires_at'),
  refreshTokenExpiresAt: isoDate('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: isoDate('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: isoDate('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey().notNull(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: isoDate('expires_at').notNull(),
  createdAt: isoDate('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: isoDate('updated_at')
    .notNull()
    .$defaultFn(() => new Date()),
});

export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey().notNull(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: isoDate('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: isoDate('expires_at'),
  alg: text('alg'),
  crv: text('crv'),
});

export const oauthClient = sqliteTable('oauth_client', {
  id: text('id').primaryKey().notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret'),
  clientDiscoveryId: text('client_discovery_id'),
  disabled: integer('disabled', { mode: 'boolean' }).default(false),
  skipConsent: integer('skip_consent', { mode: 'boolean' }),
  enableEndSession: integer('enable_end_session', { mode: 'boolean' }),
  subjectType: text('subject_type'),
  scopes: text('scopes', { mode: 'json' }),
  clientCredentialsScopes: text('client_credentials_scopes', { mode: 'json' }).default([]),
  userId: text('user_id'),
  createdAt: isoDate('created_at').$defaultFn(() => new Date()),
  updatedAt: isoDate('updated_at').$defaultFn(() => new Date()),
  name: text('name'),
  uri: text('uri'),
  icon: text('icon'),
  contacts: text('contacts', { mode: 'json' }),
  tos: text('tos'),
  policy: text('policy'),
  softwareId: text('software_id'),
  softwareVersion: text('software_version'),
  softwareStatement: text('software_statement'),
  redirectUris: text('redirect_uris', { mode: 'json' }).notNull(),
  postLogoutRedirectUris: text('post_logout_redirect_uris', { mode: 'json' }),
  backchannelLogoutUri: text('backchannel_logout_uri'),
  backchannelLogoutSessionRequired: integer('backchannel_logout_session_required', { mode: 'boolean' }),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
  applicationType: text('application_type'),
  jwks: text('jwks'),
  jwksUri: text('jwks_uri'),
  grantTypes: text('grant_types', { mode: 'json' }),
  responseTypes: text('response_types', { mode: 'json' }),
  requirePKCE: integer('require_pkce', { mode: 'boolean' }),
  dpopBoundAccessTokens: integer('dpop_bound_access_tokens', { mode: 'boolean' }).default(false),
  referenceId: text('reference_id'),
  metadata: text('metadata', { mode: 'json' }),
});

export const oauthResource = sqliteTable('oauth_resource', {
  id: text('id').primaryKey().notNull(),
  identifier: text('identifier').notNull(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes', { mode: 'json' }),
  customClaims: text('custom_claims', { mode: 'json' }),
  dpopBoundAccessTokensRequired: integer('dpop_bound_access_tokens_required', { mode: 'boolean' }).default(false),
  disabled: integer('disabled', { mode: 'boolean' }).default(false),
  createdAt: isoDate('created_at').$defaultFn(() => new Date()),
  updatedAt: isoDate('updated_at').$defaultFn(() => new Date()),
  policyVersion: integer('policy_version').default(1),
  metadata: text('metadata', { mode: 'json' }),
});

export const oauthClientResource = sqliteTable('oauth_client_resource', {
  id: text('id').primaryKey().notNull(),
  clientId: text('client_id').notNull(),
  resourceId: text('resource_id').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: isoDate('created_at').$defaultFn(() => new Date()),
});

export const oauthRefreshToken = sqliteTable('oauth_refresh_token', {
  id: text('id').primaryKey().notNull(),
  token: text('token').notNull(),
  clientId: text('client_id').notNull(),
  sessionId: text('session_id'),
  userId: text('user_id'),
  referenceId: text('reference_id'),
  authorizationCodeId: text('authorization_code_id'),
  resources: text('resources', { mode: 'json' }),
  requestedUserInfoClaims: text('requested_user_info_claims', { mode: 'json' }),
  expiresAt: isoDate('expires_at'),
  createdAt: isoDate('created_at').$defaultFn(() => new Date()),
  revoked: isoDate('revoked'),
  rotatedAt: isoDate('rotated_at'),
  rotationReplayResponse: text('rotation_replay_response'),
  rotationReplayExpiresAt: isoDate('rotation_replay_expires_at'),
  authTime: isoDate('auth_time'),
  confirmation: text('confirmation', { mode: 'json' }),
  scopes: text('scopes', { mode: 'json' }).notNull(),
});

export const oauthAccessToken = sqliteTable('oauth_access_token', {
  id: text('id').primaryKey().notNull(),
  token: text('token'),
  clientId: text('client_id').notNull(),
  sessionId: text('session_id'),
  userId: text('user_id'),
  referenceId: text('reference_id'),
  authorizationCodeId: text('authorization_code_id'),
  resources: text('resources', { mode: 'json' }),
  requestedUserInfoClaims: text('requested_user_info_claims', { mode: 'json' }),
  refreshId: text('refresh_id'),
  expiresAt: isoDate('expires_at'),
  createdAt: isoDate('created_at').$defaultFn(() => new Date()),
  revoked: isoDate('revoked'),
  confirmation: text('confirmation', { mode: 'json' }),
  scopes: text('scopes', { mode: 'json' }).notNull(),
});

export const oauthConsent = sqliteTable('oauth_consent', {
  id: text('id').primaryKey().notNull(),
  clientId: text('client_id').notNull(),
  userId: text('user_id'),
  referenceId: text('reference_id'),
  resources: text('resources', { mode: 'json' }),
  requestedUserInfoClaims: text('requested_user_info_claims', { mode: 'json' }),
  scopes: text('scopes', { mode: 'json' }).notNull(),
  createdAt: isoDate('created_at').$defaultFn(() => new Date()),
  updatedAt: isoDate('updated_at').$defaultFn(() => new Date()),
});

export const oauthClientAssertion = sqliteTable('oauth_client_assertion', {
  id: text('id').primaryKey().notNull(),
  expiresAt: isoDate('expires_at').notNull(),
});
