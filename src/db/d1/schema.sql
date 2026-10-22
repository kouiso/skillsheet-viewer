-- アプリruntime契約。データ移送処理ではない。適用はローカル合成DBのみで検証する。
PRAGMA foreign_keys=ON;
CREATE TABLE skill_sheets (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'light', is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN(0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT '0' CHECK(typeof(revision)='text' AND (revision='0' OR (revision GLOB '[1-9]*' AND revision NOT GLOB '*[^0-9]*')) AND (length(revision)<19 OR (length(revision)=19 AND revision<='9223372036854775807')))
);
CREATE INDEX skill_sheets_owner_id_idx ON skill_sheets(owner_id);
CREATE UNIQUE INDEX skill_sheets_owner_default_unique ON skill_sheets(owner_id) WHERE is_default=1;
CREATE TABLE blocks (
  id TEXT PRIMARY KEY NOT NULL, sheet_id TEXT NOT NULL REFERENCES skill_sheets(id) ON DELETE CASCADE,
  type TEXT NOT NULL, "order" INTEGER NOT NULL CHECK("order">=0),
  data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(sheet_id,"order")
);
CREATE TABLE skillsheet_state (
  owner_id TEXT PRIMARY KEY NOT NULL, deleted_sheet_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(deleted_sheet_ids)),
  initialized_at TEXT NOT NULL
);
CREATE TABLE document_versions (
  sheet_id TEXT NOT NULL, owner_id TEXT NOT NULL,
  revision TEXT NOT NULL CHECK(typeof(revision)='text' AND (revision='0' OR (revision GLOB '[1-9]*' AND revision NOT GLOB '*[^0-9]*')) AND (length(revision)<19 OR (length(revision)=19 AND revision<='9223372036854775807'))), title TEXT NOT NULL,
  blocks TEXT NOT NULL CHECK(json_valid(blocks)), action TEXT NOT NULL, recorded_at TEXT NOT NULL,
  transaction_id TEXT NOT NULL, restored_from TEXT, restored_before TEXT, UNIQUE(sheet_id,revision)
);
CREATE INDEX document_versions_owner_sheet_revision_idx ON document_versions(owner_id,sheet_id,revision);
CREATE TABLE deleted_documents (
  sheet_id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL,
  revision TEXT NOT NULL CHECK(typeof(revision)='text' AND (revision='0' OR (revision GLOB '[1-9]*' AND revision NOT GLOB '*[^0-9]*')) AND (length(revision)<19 OR (length(revision)=19 AND revision<='9223372036854775807'))), deleted_at TEXT NOT NULL
);
CREATE INDEX deleted_documents_owner_idx ON deleted_documents(owner_id);
-- batch中だけ存在するCAS成功フラグ。commit/rollbackのどちらでも残らない。
CREATE TABLE d1_operation_guard (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE viewer_login_attempt (
  key TEXT PRIMARY KEY NOT NULL, failure_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL, locked_until TEXT
);
CREATE INDEX viewer_login_attempt_expiry_idx ON viewer_login_attempt(locked_until,window_started_at);
CREATE TABLE drive_destination (
  owner_id TEXT PRIMARY KEY NOT NULL, folder_id TEXT NOT NULL, folder_name_at_selection TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE real_volume_demo_fixtures (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL UNIQUE,
  sheet_id TEXT NOT NULL REFERENCES skill_sheets(id) ON DELETE CASCADE
);
CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "email_verified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z')
);

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expires_at" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL,
  FOREIGN KEY("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TEXT,
  "refresh_token_expires_at" TEXT,
  "scope" TEXT,
  "password" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  FOREIGN KEY("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z')
);

CREATE TABLE "jwks" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "public_key" TEXT NOT NULL,
  "private_key" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "expires_at" TEXT,
  "alg" TEXT,
  "crv" TEXT
);

CREATE TABLE "oauth_client" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_secret" TEXT,
  "client_discovery_id" TEXT,
  "disabled" INTEGER DEFAULT 0,
  "skip_consent" INTEGER,
  "enable_end_session" INTEGER,
  "subject_type" TEXT,
  "scopes" TEXT,
  "client_credentials_scopes" TEXT DEFAULT '[]',
  "user_id" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "name" TEXT,
  "uri" TEXT,
  "icon" TEXT,
  "contacts" TEXT,
  "tos" TEXT,
  "policy" TEXT,
  "software_id" TEXT,
  "software_version" TEXT,
  "software_statement" TEXT,
  "redirect_uris" TEXT NOT NULL,
  "post_logout_redirect_uris" TEXT,
  "backchannel_logout_uri" TEXT,
  "backchannel_logout_session_required" INTEGER,
  "token_endpoint_auth_method" TEXT,
  "application_type" TEXT,
  "jwks" TEXT,
  "jwks_uri" TEXT,
  "grant_types" TEXT,
  "response_types" TEXT,
  "require_pkce" INTEGER,
  "dpop_bound_access_tokens" INTEGER DEFAULT 0,
  "reference_id" TEXT,
  "metadata" TEXT,
  FOREIGN KEY("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "oauth_resource" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "access_token_ttl" INTEGER,
  "refresh_token_ttl" INTEGER,
  "signing_algorithm" TEXT,
  "signing_key_id" TEXT,
  "allowed_scopes" TEXT,
  "custom_claims" TEXT,
  "dpop_bound_access_tokens_required" INTEGER DEFAULT 0,
  "disabled" INTEGER DEFAULT 0,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "policy_version" INTEGER DEFAULT 1,
  "metadata" TEXT
);

CREATE TABLE "oauth_client_resource" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "client_id" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "metadata" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  FOREIGN KEY("client_id") REFERENCES "oauth_client"("client_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  FOREIGN KEY("resource_id") REFERENCES "oauth_resource"("identifier") ON DELETE CASCADE ON UPDATE NO ACTION,
  UNIQUE("client_id","resource_id")
);

CREATE TABLE "oauth_refresh_token" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "token" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "session_id" TEXT,
  "user_id" TEXT,
  "reference_id" TEXT,
  "authorization_code_id" TEXT,
  "resources" TEXT,
  "requested_user_info_claims" TEXT,
  "expires_at" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "revoked" TEXT,
  "rotated_at" TEXT,
  "rotation_replay_response" TEXT,
  "rotation_replay_expires_at" TEXT,
  "auth_time" TEXT,
  "confirmation" TEXT,
  "scopes" TEXT NOT NULL,
  FOREIGN KEY("client_id") REFERENCES "oauth_client"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("session_id") REFERENCES "session"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "oauth_access_token" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "token" TEXT,
  "client_id" TEXT NOT NULL,
  "session_id" TEXT,
  "user_id" TEXT,
  "reference_id" TEXT,
  "authorization_code_id" TEXT,
  "resources" TEXT,
  "requested_user_info_claims" TEXT,
  "refresh_id" TEXT,
  "expires_at" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "revoked" TEXT,
  "confirmation" TEXT,
  "scopes" TEXT NOT NULL,
  FOREIGN KEY("client_id") REFERENCES "oauth_client"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("session_id") REFERENCES "session"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("refresh_id") REFERENCES "oauth_refresh_token"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "oauth_consent" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "client_id" TEXT NOT NULL,
  "user_id" TEXT,
  "reference_id" TEXT,
  "resources" TEXT,
  "requested_user_info_claims" TEXT,
  "scopes" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || '000Z'),
  FOREIGN KEY("client_id") REFERENCES "oauth_client"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "oauth_client_assertion" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expires_at" TEXT NOT NULL
);
CREATE UNIQUE INDEX user_email_unique ON "user"(email);
CREATE UNIQUE INDEX session_token_unique ON session(token);
CREATE INDEX session_user_id_idx ON session(user_id);
CREATE INDEX account_user_id_idx ON account(user_id);
CREATE UNIQUE INDEX oauth_client_client_id_unique ON oauth_client(client_id);
CREATE UNIQUE INDEX oauth_resource_identifier_unique ON oauth_resource(identifier);
CREATE UNIQUE INDEX oauth_client_resource_client_id_resource_id_unique ON oauth_client_resource(client_id,resource_id);
CREATE UNIQUE INDEX oauth_refresh_token_token_unique ON oauth_refresh_token(token);
CREATE UNIQUE INDEX oauth_access_token_token_unique ON oauth_access_token(token);
CREATE INDEX "oauth_access_token_client_id_idx" ON "oauth_access_token"("client_id");
CREATE INDEX "oauth_access_token_session_id_idx" ON "oauth_access_token"("session_id");
CREATE INDEX "oauth_access_token_user_id_idx" ON "oauth_access_token"("user_id");
CREATE INDEX "oauth_access_token_authorization_code_id_idx" ON "oauth_access_token"("authorization_code_id");
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "oauth_access_token"("refresh_id");
CREATE INDEX "oauth_client_user_id_idx" ON "oauth_client"("user_id");
CREATE INDEX "oauth_client_resource_client_id_idx" ON "oauth_client_resource"("client_id");
CREATE INDEX "oauth_client_resource_resource_id_idx" ON "oauth_client_resource"("resource_id");
CREATE INDEX "oauth_consent_client_id_idx" ON "oauth_consent"("client_id");
CREATE INDEX "oauth_consent_user_id_idx" ON "oauth_consent"("user_id");
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token"("client_id");
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "oauth_refresh_token"("session_id");
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token"("user_id");
CREATE INDEX "oauth_refresh_token_authorization_code_id_idx" ON "oauth_refresh_token"("authorization_code_id");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
