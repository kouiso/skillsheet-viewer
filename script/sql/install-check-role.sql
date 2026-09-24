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
-- PostgreSQL 16+ 前提（GRANT ... WITH SET 句を境界 install 側でも使うため同じ下限を置く）。
--
-- 既存 role には前時代の GRANT 残骸（public テーブルへの直接 SELECT など）や
-- INHERIT 属性・membership が残りうる。ALTER ROLE では属性しか正規化できず、
-- 付与済みの権限は消えないため、毎回「宣言した状態へ収束」させる —— 属性・
-- 直読み権限・membership を除去してから必要最小限を付与し直す（付与だけでなく
-- 除去も冪等にするのがこのファイルの役目）。
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
    -- SUPERUSER / REPLICATION / BYPASSRLS は superuser でないと ALTER できない
    -- （NOSUPERUSER と書いても弾かれる）。管理可能な属性だけ宣言値へ収束する。
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
      current_setting('vars.check_role'), current_setting('vars.check_password')
    );
  END IF;
END
$$;

-- 宣言に反する直読み権限を除去（旧版で付与された public テーブルの SELECT 等）。
-- public schema 自体の USAGE は PUBLIC 経由でどうせ残るため、防御層はテーブル権限側。
DO $$
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', current_setting('vars.check_role'));
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', current_setting('vars.check_role'));
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', current_setting('vars.check_role'));
END
$$;

-- check role への・からの membership をすべて除去（SET ROLE による境界迂回を防ぐ）。
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
    WHERE r.rolname = current_setting('vars.check_role')
       OR me.rolname = current_setting('vars.check_role')
  LOOP
    EXECUTE format('REVOKE %I FROM %I', m.role, m.member);
  END LOOP;
END
$$;

-- skillsheet_private 側の除去と付与は owner（reader/writer）として行う必要が
-- あるため、接続ユーザーへ membership を一時貸出して SET ROLE で通す
-- （ci.yml の e2e 脚と同じ経路）。既存 membership が set_option=false でも
-- WITH SET TRUE で借り直し、終わりに剥がして cluster 全域に残さない。
-- 関数の REVOKE は owner ごとに分けて当てる（他 owner の関数は permission
-- denied でスクリプト全体が止まる）— writer 側に write 系 / checked_blocks の
-- EXECUTE が残っていても落としきる。
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
     FROM %I', current_setting('vars.check_role'));
END
$$;
RESET ROLE;
SET ROLE skillsheet_document_reader;
DO $$
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA skillsheet_private FROM %I', current_setting('vars.check_role'));
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON FUNCTION
       skillsheet_private.read_snapshot(uuid, text),
       skillsheet_private.list_sheets(text)
     FROM %I', current_setting('vars.check_role'));
  EXECUTE format('GRANT USAGE ON SCHEMA skillsheet_private TO %I', current_setting('vars.check_role'));
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION
       skillsheet_private.read_snapshot(uuid, text),
       skillsheet_private.list_sheets(text)
     TO %I', current_setting('vars.check_role'));
END
$$;
RESET ROLE;
REVOKE skillsheet_document_reader, skillsheet_document_writer FROM CURRENT_USER;

-- 境界関数は SESSION_USER を principals へ引いて owner を決めるため、
-- check の login_name を登録しないと全呼び出しが UNMAPPED_PRINCIPAL になる。
INSERT INTO skillsheet_private.principals (login_name, owner_id)
VALUES (current_setting('vars.check_role'), current_setting('vars.owner_id'))
ON CONFLICT (login_name) DO UPDATE SET owner_id = EXCLUDED.owner_id;

COMMIT;
