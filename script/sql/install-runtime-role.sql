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
    EXECUTE format(
      'ALTER ROLE %I PASSWORD %L',
      current_setting('vars.runtime_role'), current_setting('vars.runtime_password')
    );
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA skillsheet_private TO %I', current_setting('vars.runtime_role'));
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION
       skillsheet_private.read_snapshot(uuid, text),
       skillsheet_private.list_sheets(text),
       skillsheet_private.replace_sheet(uuid, text, text, jsonb, text),
       skillsheet_private.create_sheet(uuid, text, jsonb, text),
       skillsheet_private.delete_sheet(uuid, text, text)
     TO %I', current_setting('vars.runtime_role'));
END
$$;

-- 境界関数は SESSION_USER を principals へ引いて owner を決めるため、
-- runtime の login_name を登録しないと全呼び出しが UNMAPPED_PRINCIPAL になる。
INSERT INTO skillsheet_private.principals (login_name, owner_id)
VALUES (current_setting('vars.runtime_role'), current_setting('vars.owner_id'))
ON CONFLICT (login_name) DO UPDATE SET owner_id = EXCLUDED.owner_id;

COMMIT;
