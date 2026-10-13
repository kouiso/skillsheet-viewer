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
-- 管理接続はpublic各objectのGRANT/REVOKE権限と境界ownerのADMIN権限が必要。
-- 正規化するのは列挙属性・membership・ACL。role/DB別GUCは管理者の設定として保持する。
-- GUCによるtimeout等の運用制限は、実際のLOGIN接続で別途疎通確認する。
-- runtimeを管理する他の利用者へのmembershipは除去し、この実行管理者だけ保持する。
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
DECLARE runtime_oid oid;
BEGIN
  SELECT oid INTO runtime_oid FROM pg_roles WHERE rolname = current_setting('vars.runtime_role');
  -- 降格できない属性や所有権は、password・membershipを変える前に拒否する。
  IF EXISTS (SELECT FROM pg_roles WHERE oid = runtime_oid
    AND (rolsuper OR rolreplication OR rolbypassrls OR rolconnlimit = 0
      OR rolvaliduntil <= clock_timestamp())) THEN
    RAISE EXCEPTION 'UNSAFE_RUNTIME_ROLE' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT FROM pg_database WHERE datname = current_database() AND datdba = runtime_oid)
    OR EXISTS (SELECT FROM pg_namespace WHERE nspname IN ('public','skillsheet_private') AND nspowner = runtime_oid)
    OR EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','skillsheet_private') AND c.relowner = runtime_oid)
    OR EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public','skillsheet_private') AND p.proowner = runtime_oid) THEN
    RAISE EXCEPTION 'UNSAFE_RUNTIME_OWNERSHIP' USING ERRCODE = '42501';
  END IF;
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

-- runtimeの昇格membershipを除去。信頼済み管理者のruntime管理権だけ保持する。
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
       AND me.rolname <> SESSION_USER
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
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', current_setting('vars.runtime_role'));
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', current_setting('vars.runtime_role'));
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
       public."user",
       public.session,
       public.account,
       public.verification,
       public.jwks,
       public.viewer_login_attempt,
       public.drive_destination,
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
-- 新規借用分は剥がし、既存の管理者membershipは元のoptionへ戻す。
-- 関数の REVOKE は owner ごとに分けて当てる（他 owner の関数は permission
-- denied でスクリプト全体が止まる）。
-- 借用前の自分がgrantorであるmembershipだけを記録し、既存ADMIN/SET/INHERITを戻す。
SELECT set_config('vars.owner_memberships', COALESCE((
  SELECT jsonb_object_agg(r.rolname, jsonb_build_object(
    'admin', am.admin_option, 'inherit', am.inherit_option, 'set', am.set_option))
  FROM pg_auth_members am JOIN pg_roles r ON r.oid = am.roleid
  WHERE am.member = CURRENT_USER::regrole AND am.grantor = CURRENT_USER::regrole
    AND r.rolname IN ('skillsheet_document_reader','skillsheet_document_writer')
), '{}'::jsonb)::text, true);
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
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA skillsheet_private FROM %I', current_setting('vars.runtime_role'));
  EXECUTE format('GRANT USAGE ON SCHEMA skillsheet_private TO %I', current_setting('vars.runtime_role'));
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION
       skillsheet_private.read_snapshot(uuid, text),
       skillsheet_private.list_sheets(text)
     TO %I', current_setting('vars.runtime_role'));
END
$$;
RESET ROLE;
DO $$
DECLARE
  owner_role text;
  original jsonb;
BEGIN
  FOREACH owner_role IN ARRAY ARRAY['skillsheet_document_reader','skillsheet_document_writer'] LOOP
    original := current_setting('vars.owner_memberships')::jsonb -> owner_role;
    IF original IS NULL THEN
      EXECUTE format('REVOKE %I FROM %I GRANTED BY %I', owner_role, CURRENT_USER, CURRENT_USER);
    ELSE
      EXECUTE format('GRANT %I TO %I WITH ADMIN %s, INHERIT %s, SET %s',
        owner_role, CURRENT_USER, original->>'admin', original->>'inherit', original->>'set');
    END IF;
  END LOOP;
END
$$;

-- 境界関数は SESSION_USER を principals へ引いて owner を決めるため、
-- runtime の login_name を登録しないと全呼び出しが UNMAPPED_PRINCIPAL になる。
INSERT INTO skillsheet_private.principals (login_name, owner_id)
VALUES (current_setting('vars.runtime_role'), current_setting('vars.owner_id'))
ON CONFLICT (login_name) DO UPDATE SET owner_id = EXCLUDED.owner_id;

-- PUBLIC等の継承権限は直接REVOKEだけでは消えない。共有権限を勝手に変更せず停止する。
DO $$
DECLARE runtime_oid oid := current_setting('vars.runtime_role')::regrole;
BEGIN
  IF EXISTS (SELECT FROM pg_auth_members
    WHERE member = runtime_oid OR (roleid = runtime_oid AND member <> SESSION_USER::regrole))
    OR has_table_privilege(runtime_oid, 'public.skill_sheets', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege(runtime_oid, 'public.blocks', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege(runtime_oid, 'public.skillsheet_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege(runtime_oid, 'skillsheet_private.principals', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege(runtime_oid, 'public.skill_sheets', 'SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege(runtime_oid, 'public.blocks', 'SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege(runtime_oid, 'public.skillsheet_state', 'SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege(runtime_oid, 'skillsheet_private.principals', 'SELECT,INSERT,UPDATE,REFERENCES')
    -- 宣言した認証/Driveの基表以外は、view・matview・foreign table・列ACLも含め拒否する。
    OR EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','skillsheet_private') AND c.relkind IN ('r','p','v','m','f')
        AND NOT (n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname = ANY (ARRAY['user','session','account','verification','jwks','viewer_login_attempt',
            'drive_destination','oauth_client','oauth_client_assertion','oauth_client_resource',
            'oauth_consent','oauth_access_token','oauth_refresh_token','oauth_resource']))
        AND (has_table_privilege(runtime_oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(runtime_oid, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
    OR EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege(runtime_oid, p.oid, 'EXECUTE'))
    OR EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'skillsheet_private' AND has_function_privilege(runtime_oid, p.oid, 'EXECUTE')
        AND p.oid NOT IN (
          'skillsheet_private.read_snapshot(uuid,text)'::regprocedure,
          'skillsheet_private.list_sheets(text)'::regprocedure,
          'skillsheet_private.replace_sheet(uuid,text,text,jsonb,text)'::regprocedure,
          'skillsheet_private.create_sheet(uuid,text,jsonb,text)'::regprocedure,
          'skillsheet_private.delete_sheet(uuid,text,text)'::regprocedure))
    OR has_schema_privilege(runtime_oid, 'public', 'CREATE')
    OR has_schema_privilege(runtime_oid, 'skillsheet_private', 'CREATE')
    OR has_function_privilege(runtime_oid, 'skillsheet_private.checked_blocks(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RUNTIME_BOUNDARY_PERMISSION_LEAK' USING ERRCODE = '42501';
  END IF;
  -- MAINTAINはPG17で追加されたため、PG16では評価しない。
  IF current_setting('server_version_num')::integer >= 170000 THEN
    IF EXISTS (SELECT FROM pg_auth_members
    WHERE member = runtime_oid OR (roleid = runtime_oid AND member <> SESSION_USER::regrole))
    OR has_table_privilege(runtime_oid, 'public.skill_sheets', 'MAINTAIN')
      OR has_table_privilege(runtime_oid, 'public.blocks', 'MAINTAIN')
      OR has_table_privilege(runtime_oid, 'public.skillsheet_state', 'MAINTAIN')
      OR has_table_privilege(runtime_oid, 'skillsheet_private.principals', 'MAINTAIN') THEN
      RAISE EXCEPTION 'RUNTIME_BOUNDARY_PERMISSION_LEAK' USING ERRCODE = '42501';
    END IF;
  END IF;
END
$$;

COMMIT;
