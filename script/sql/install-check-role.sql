-- 定期チェック（PDF Layout Check / XLSX Format Check）が使う読み取り専用の
-- LOGIN role を作り、read 境界の最小権限（USAGE + 読取系 EXECUTE のみ）を付与し、
-- principals へ login_name → owner_id を登録する。
-- 読取・書込境界の install 済み DB へ管理接続で実行する。
--
-- 使い方（値はすべて必須）:
--   psql "$ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--     -v check_role='ci_check_ro' \
--     -v check_password='<generated>' \
--     -v owner_id='<SKILLSHEET_OWNER_ID>' \
--     -f script/sql/install-check-role.sql
--
-- check role は reader/writer の member にしない（membership は SET ROLE を許し、
-- 境界関数を迂回した直接テーブル操作を可能にするため）。USAGE + EXECUTE のみで、
-- 読取系の公開関数以外には触れない。public テーブルの DML 権限も一切付けない。
--
-- $$ 内では psql 変数が展開されないため、一度カスタム GUC へ入れて
-- current_setting() で読む。
SET vars.check_role = :'check_role';
SET vars.check_password = :'check_password';
SET vars.owner_id = :'owner_id';

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = current_setting('vars.check_role')) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
      current_setting('vars.check_role'), current_setting('vars.check_password')
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I PASSWORD %L',
      current_setting('vars.check_role'), current_setting('vars.check_password')
    );
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA skillsheet_private TO %I', current_setting('vars.check_role'));
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION
       skillsheet_private.read_snapshot(uuid, text),
       skillsheet_private.list_sheets(text)
     TO %I', current_setting('vars.check_role'));
END
$$;

-- 境界関数は SESSION_USER を principals へ引いて owner を決めるため、
-- check の login_name を登録しないと全呼び出しが UNMAPPED_PRINCIPAL になる。
INSERT INTO skillsheet_private.principals (login_name, owner_id)
VALUES (current_setting('vars.check_role'), current_setting('vars.owner_id'))
ON CONFLICT (login_name) DO UPDATE SET owner_id = EXCLUDED.owner_id;

COMMIT;
