-- 本番 runtime が使う LOGIN role を作り、文書境界の最小権限（USAGE + EXECUTE のみ）を
-- 付与し、principals へ login_name → owner_id を登録する（#345）。
-- 読取・書込境界の install 済み DB へ管理接続で実行する。
--
-- 使い方（値はすべて必須）:
--   psql "$ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--     -v runtime_role='skillsheet_runtime' \
--     -v runtime_password='<generated>' \
--     -v owner_id='<SKILLSHEET_OWNER_ID>' \
--     -f script/sql/install-runtime-role.sql
--
-- runtime role は reader/writer の member にはしない（membership は SET ROLE を許し、
-- 境界関数を迂回した直接テーブル操作を可能にするため）。USAGE + EXECUTE のみで、
-- 5 つの公開関数以外には触れない。
-- PostgreSQL 16+ 前提（GRANT ... WITH SET 句を使う）。
--
-- 既存 role には手作業や旧版の GRANT 残骸・INHERIT 属性・membership が残りうる。
-- ALTER ROLE では属性しか正規化できず付与済みの権限は消えないため、毎回
-- 「宣言した状態へ収束」させる —— 属性・membership・権限を除去してから
-- 宣言分だけ付与し直す（付与だけでなく除去も冪等にするのがこのファイルの役目）。
--
-- $$ 内では psql 変数が展開されないため、一度カスタム GUC へ入れて
-- current_setting() で読む。
SET vars.runtime_role = :'runtime_role';
SET vars.runtime_password = :'runtime_password';
SET vars.owner_id = :'owner_id';

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = current_setting('vars.runtime_role')) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
      current_setting('vars.runtime_role'), current_setting('vars.runtime_password')
    );
  ELSE
    -- SUPERUSER / REPLICATION / BYPASSRLS は superuser でないと ALTER できない
    -- （NOSUPERUSER と書いても弾かれる）。管理可能な属性だけ宣言値へ収束する。
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
      current_setting('vars.runtime_role'), current_setting('vars.runtime_password')
    );
  END IF;
END
$$;

-- runtime が関わる membership をすべて除去（SET ROLE による境界迂回を防ぐ）。
-- 既存のものだけ剥がす: 無関係な role への REVOKE は権限不足で失敗しうる。
DO $$
DECLARE
  m record;
BEGIN
  FOR m IN
    SELECT r.rolname AS role, me.rolname AS member
    FROM pg_auth_members am
    JOIN pg_roles r ON r.oid = am.roleid
    JOIN pg_roles me ON me.oid = am.member
    WHERE r.rolname = current_setting('vars.runtime_role')
       OR me.rolname = current_setting('vars.runtime_role')
  LOOP
    EXECUTE format('REVOKE %I FROM %I', m.role, m.member);
  END LOOP;
END
$$;

-- 同じ DATABASE_URL が認証（better-auth）と閲覧 rate-limit にも使われるため、
-- 境界で守らない公開テーブルには通常の DML 権限が要る。境界対象の
-- skill_sheets / blocks / skillsheet_state には一切権限を付けない —
-- これらは SECURITY DEFINER の境界関数経由でしか触れない。
-- real_volume_demo_fixtures は投入ツール専用なので runtime には付けない。
-- いったん public schema の権限を全除去してから宣言分だけ付け直すことで、
-- 残骸（境界対象テーブルへの直接 DML 等）も毎回消える。
DO $$
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', current_setting('vars.runtime_role'));
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', current_setting('vars.runtime_role'));
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', current_setting('vars.runtime_role'));
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', current_setting('vars.runtime_role'));
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
       public."user",
       public.session,
       public.account,
       public.verification,
       public.jwks,
       public.viewer_login_attempt,
       public.oauth_client,
       public.oauth_client_assertion,
       public.oauth_client_resource,
       public.oauth_consent,
       public.oauth_access_token,
       public.oauth_refresh_token,
       public.oauth_resource
     TO %I', current_setting('vars.runtime_role'));
END
$$;

-- skillsheet_private 側の除去と付与は owner（reader/writer）として行う必要が
-- あるため、接続ユーザーへ membership を一時貸出して SET ROLE で通す。
-- 既存 membership が set_option=false でも WITH SET TRUE で借り直し、
-- 終わりに剥がして cluster 全域に残さない。
-- 関数の REVOKE は owner ごとに分けて当てる（他 owner の関数は permission
-- denied でスクリプト全体が止まる）。
GRANT skillsheet_document_reader, skillsheet_document_writer TO CURRENT_USER WITH SET TRUE;
SET ROLE skillsheet_document_writer;
DO $$
BEGIN
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON FUNCTION
       skillsheet_private.replace_sheet(uuid, text, text, jsonb, text),
       skillsheet_private.create_sheet(uuid, text, jsonb, text),
       skillsheet_private.delete_sheet(uuid, text, text),
       skillsheet_private.checked_blocks(jsonb)
     FROM %I', current_setting('vars.runtime_role'));
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION
       skillsheet_private.replace_sheet(uuid, text, text, jsonb, text),
       skillsheet_private.create_sheet(uuid, text, jsonb, text),
       skillsheet_private.delete_sheet(uuid, text, text)
     TO %I', current_setting('vars.runtime_role'));
END
$$;
RESET ROLE;
SET ROLE skillsheet_document_reader;
DO $$
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA skillsheet_private FROM %I', current_setting('vars.runtime_role'));
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON FUNCTION
       skillsheet_private.read_snapshot(uuid, text),
       skillsheet_private.list_sheets(text)
     FROM %I', current_setting('vars.runtime_role'));
  EXECUTE format('GRANT USAGE ON SCHEMA skillsheet_private TO %I', current_setting('vars.runtime_role'));
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION
       skillsheet_private.read_snapshot(uuid, text),
       skillsheet_private.list_sheets(text)
     TO %I', current_setting('vars.runtime_role'));
END
$$;
RESET ROLE;
REVOKE skillsheet_document_reader, skillsheet_document_writer FROM CURRENT_USER;

-- 境界関数は SESSION_USER を principals へ引いて owner を決めるため、
-- runtime の login_name を登録しないと全呼び出しが UNMAPPED_PRINCIPAL になる。
INSERT INTO skillsheet_private.principals (login_name, owner_id)
VALUES (current_setting('vars.runtime_role'), current_setting('vars.owner_id'))
ON CONFLICT (login_name) DO UPDATE SET owner_id = EXCLUDED.owner_id;

COMMIT;
