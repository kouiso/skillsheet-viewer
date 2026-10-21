-- 本番 runtime が使う LOGIN role を作り、文書境界の最小権限（USAGE + EXECUTE のみ）を
-- 付与し、principals へ login_name → owner_id を登録する（#345）。
-- 読取・書込境界の install 済み DB へ管理接続で実行する。
--
-- 使い方（値はすべて必須）:
--   PGSERVICE=skillsheet_admin psql -X -v ON_ERROR_STOP=1 \
--     -v runtime_role='skillsheet_runtime' \
--     -v owner_id='<SKILLSHEET_OWNER_ID>' \
--     -f "$PRIVATE_RUNTIME_WRAPPER"
-- runtime_passwordは引数に置かず、0600の私有wrapperに次の2行を保存する:
--   \set runtime_password '<generated>'
--   \ir /absolute/path/to/script/sql/install-runtime-role.sql
--
-- runtime role は reader/writer の member にはしない（membership は SET ROLE を許し、
-- 境界関数を迂回した直接テーブル操作を可能にするため）。USAGE + EXECUTE のみで、
-- coreの5公開関数と、導入済みの履歴6公開関数以外には触れない。
-- 管理接続はCREATEROLE、public各objectのGRANT/REVOKE、境界ownerのADMIN、
-- principalsのSELECT/INSERT/UPDATEが必要。CREATEDB=trueの降格にはCREATEDBも必要。
-- 正規化するのは列挙属性・membership・ACL。role/DB別GUCは管理者の設定として保持する。
-- GUCによるtimeout等の運用制限は、実際のLOGIN接続で別途疎通確認する。
-- runtimeを管理する他の利用者へのmembershipは除去し、この実行管理者だけ保持する。
-- log_statement=all、SQL全文の監視・echoは秘密入力も記録するため、管理者が無効化する。
-- passwordはbind値で渡すため、所要時間・抽出のログはDETAILへ値を出す。値を出さない
-- log_parameter_max_length=0か、所要時間・抽出・auto_explainのログ無効を入力前に求める。
-- lock-waitログが有効なら、PASSWORD文だけをdeadlock検査より短い待機に制限する。
-- server/clientはPostgreSQL 16+ 前提（WITH SET、psqlのbindを使う）。
--
-- 既存 role には手作業や旧版の GRANT 残骸・INHERIT 属性・membership が残りうる。
-- ALTER ROLE では属性しか正規化できず付与済みの権限は消えないため、毎回
-- 「宣言した状態へ収束」させる —— 属性・membership・権限を除去してから
-- 宣言分だけ付与し直す（付与だけでなく除去も冪等にするのがこのファイルの役目）。
--
-- $$ 内では psql 変数が展開されないため、一度カスタム GUC へ入れて
-- current_setting() で読む。
BEGIN;
-- 必須変数の入力失敗も同じtransactionを中断し、前回の値で再設定しない。
SET vars.runtime_role = :'runtime_role';
SET vars.owner_id = :'owner_id';
-- utilityのSETへ秘密を埋め込むとPG17のpg_stat_statementsに残る。入力前に監視条件を検査する。
\set runtime_password_input_allowed false
-- 単位付きの表示値ではなく、pg_settingsの基本単位の値で比べる。読めない設定は拒否側に倒す。
SELECT COALESCE(COALESCE(current_setting('pg_stat_statements.track', true), 'none') <> 'all'
  AND current_setting('log_statement') <> 'all'
  -- 文が失敗した時のCONTEXTにもbind値が出る。
  AND s.on_error_length = 0
  AND (s.parameter_length = 0
    OR (s.min_duration = -1
      AND (s.min_duration_sample = -1 OR s.statement_sample_rate = 0)
      AND s.transaction_sample_rate = 0))
  -- auto_explainはQuery Parametersとして値を出す。未読込ならGUCは無い。
  AND (COALESCE(current_setting('auto_explain.log_min_duration', true), '-1') = '-1'
    OR COALESCE(current_setting('auto_explain.log_parameter_max_length', true), '-1') = '0'), false)
  AS runtime_password_input_allowed
FROM (
  SELECT
    max(setting::numeric) FILTER (WHERE name = 'log_parameter_max_length_on_error') AS on_error_length,
    max(setting::numeric) FILTER (WHERE name = 'log_parameter_max_length') AS parameter_length,
    max(setting::numeric) FILTER (WHERE name = 'log_min_duration_statement') AS min_duration,
    max(setting::numeric) FILTER (WHERE name = 'log_min_duration_sample') AS min_duration_sample,
    max(setting::numeric) FILTER (WHERE name = 'log_statement_sample_rate') AS statement_sample_rate,
    max(setting::numeric) FILTER (WHERE name = 'log_transaction_sample_rate') AS transaction_sample_rate
  FROM pg_settings
) s
\gset
\if :{?runtime_password}
\if :runtime_password_input_allowed
  SELECT set_config('vars.runtime_password', $1, true) IS NOT NULL
  \bind :runtime_password
  \g
\else
  DO $$ BEGIN
    RAISE EXCEPTION 'UNSAFE_RUNTIME_PASSWORD_TELEMETRY' USING ERRCODE = '42501',
      HINT = 'log_statement と pg_stat_statements.track を all 以外、log_parameter_max_length_on_error を 0 にする。'
        || 'さらに log_parameter_max_length を 0 にするか、log_min_duration_statement と log_min_duration_sample を -1、'
        || 'log_transaction_sample_rate を 0 にする（auto_explain 読込時は auto_explain.log_min_duration を -1 にする）。';
  END $$;
\endif
\else
  DO $$ BEGIN
    RAISE EXCEPTION 'INVALID_RUNTIME_PASSWORD' USING ERRCODE = '22023';
  END $$;
\endif
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  runtime_oid oid;
  runtime_createdb boolean;
  runtime_createrole boolean;
  credential_lock_timeout text;
  credential_lock_ms numeric;
  deadlock_timeout_ms numeric;
  credential_wait_ms bigint;
BEGIN
  IF current_setting('vars.runtime_password') = '' THEN
    RAISE EXCEPTION 'INVALID_RUNTIME_PASSWORD' USING ERRCODE = '22023';
  END IF;
  SELECT oid, rolcreatedb, rolcreaterole INTO runtime_oid, runtime_createdb, runtime_createrole
  FROM pg_roles WHERE rolname = current_setting('vars.runtime_role');
  -- 降格できない属性や所有権は、password・membershipを変える前に拒否する。
  IF EXISTS (SELECT FROM pg_roles WHERE oid = runtime_oid
    AND (rolname = SESSION_USER OR rolsuper OR rolreplication OR rolbypassrls OR rolconnlimit = 0
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
  -- LOGのlock-wait報告は例外処理より先に動的PASSWORD文を記録しうる。
  credential_lock_timeout := current_setting('lock_timeout');
  IF current_setting('log_lock_waits')::boolean THEN
    deadlock_timeout_ms := floor(EXTRACT(EPOCH FROM current_setting('deadlock_timeout')::interval) * 1000);
    IF deadlock_timeout_ms <= 1 THEN
      RAISE EXCEPTION 'UNSAFE_RUNTIME_PASSWORD_LOGGING' USING ERRCODE = '42501';
    END IF;
    credential_wait_ms := greatest(1, floor(deadlock_timeout_ms / 2)::bigint);
    credential_lock_ms := EXTRACT(EPOCH FROM credential_lock_timeout::interval) * 1000;
  END IF;
  BEGIN
    IF credential_wait_ms IS NOT NULL
      AND (credential_lock_ms = 0 OR credential_lock_ms > credential_wait_ms) THEN
      PERFORM set_config('lock_timeout', credential_wait_ms::text || 'ms', true);
    END IF;
    IF runtime_oid IS NULL THEN
      EXECUTE format(
        'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
        current_setting('vars.runtime_role'), current_setting('vars.runtime_password')
      );
    ELSE
      -- falseの属性を再指定すると、不要な管理権限の検査が発生する。
      EXECUTE format(
        'ALTER ROLE %I LOGIN %s %s NOINHERIT PASSWORD %L',
        current_setting('vars.runtime_role'),
        CASE WHEN runtime_createdb THEN 'NOCREATEDB' ELSE '' END,
        CASE WHEN runtime_createrole THEN 'NOCREATEROLE' ELSE '' END,
        current_setting('vars.runtime_password')
      );
    END IF;
    PERFORM set_config('lock_timeout', credential_lock_timeout, true);
  EXCEPTION WHEN query_canceled OR assert_failure OR OTHERS THEN
    -- 元の動的SQLやDETAILを再掲するとPASSWORDがログへ出る。
    RAISE EXCEPTION 'RUNTIME_ROLE_ATTRIBUTE_UPDATE_FAILED' USING ERRCODE = SQLSTATE;
  END;
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
DECLARE private_sequence record;
BEGIN
  FOR private_sequence IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'skillsheet_private' AND c.relkind = 'S' AND c.relowner = CURRENT_USER::regrole
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE skillsheet_private.%I FROM %I',
      private_sequence.relname, current_setting('vars.runtime_role'));
  END LOOP;
  IF has_database_privilege(current_setting('vars.runtime_role'), current_database(), 'CREATE') THEN
    EXECUTE format('REVOKE CREATE ON DATABASE %I FROM %I', current_database(), current_setting('vars.runtime_role'));
  END IF;
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
-- 暗黙のGRANTが選ぶgrantorは管理者本人とは限らない。全grantorを記録する。
SELECT set_config('vars.owner_memberships', COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'roleid', am.roleid, 'member', am.member, 'grantor', am.grantor,
    'admin', am.admin_option, 'inherit', am.inherit_option, 'set', am.set_option)
    ORDER BY am.roleid, am.member, am.grantor)
  FROM pg_auth_members am JOIN pg_roles r ON r.oid = am.roleid
  WHERE am.member = CURRENT_USER::regrole
    AND r.rolname IN ('skillsheet_document_reader','skillsheet_document_writer')
), '[]'::jsonb)::text, true);
GRANT skillsheet_document_reader, skillsheet_document_writer TO CURRENT_USER WITH SET TRUE;
SET ROLE skillsheet_document_writer;
DO $$
DECLARE
  private_sequence record;
  history_signature text;
  history_function regprocedure;
  history_public_signatures CONSTANT text[] := ARRAY[
    'skillsheet_private.history_list(uuid,text,integer,text)',
    'skillsheet_private.history_read(uuid,text,text)',
    'skillsheet_private.history_count_after(uuid,text,text,text)',
    'skillsheet_private.history_restore(uuid,text,text,text)',
    'skillsheet_private.deleted_document_list(text)',
    'skillsheet_private.restore_deleted_document(uuid,text,text)'
  ];
BEGIN
  FOR private_sequence IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'skillsheet_private' AND c.relkind = 'S' AND c.relowner = CURRENT_USER::regrole
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE skillsheet_private.%I FROM %I',
      private_sequence.relname, current_setting('vars.runtime_role'));
  END LOOP;
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
  -- 履歴導入前は存在しない。導入済みの公開関数だけ再付与し、internalの残骸も除去する。
  FOREACH history_signature IN ARRAY history_public_signatures || ARRAY[
    'skillsheet_private.capture_document(uuid,text,bigint,text,text)',
    'skillsheet_private.capture_document_blocks()',
    'skillsheet_private.capture_document_trigger()',
    'skillsheet_private.history_owner(text)'
  ] LOOP
    history_function := to_regprocedure(history_signature);
    IF history_function IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',
        history_function, current_setting('vars.runtime_role'));
      IF history_signature = ANY (history_public_signatures) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',
          history_function, current_setting('vars.runtime_role'));
      END IF;
    END IF;
  END LOOP;
END
$$;
RESET ROLE;
SET ROLE skillsheet_document_reader;
DO $$
DECLARE private_sequence record;
BEGIN
  FOR private_sequence IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'skillsheet_private' AND c.relkind = 'S' AND c.relowner = CURRENT_USER::regrole
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE skillsheet_private.%I FROM %I',
      private_sequence.relname, current_setting('vars.runtime_role'));
  END LOOP;
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
  membership record;
  original jsonb;
  actual jsonb;
BEGIN
  FOR membership IN
    SELECT am.*, r.rolname AS owner_role, g.rolname AS grantor_role
    FROM pg_auth_members am
    JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles g ON g.oid = am.grantor
    WHERE am.member = CURRENT_USER::regrole
      AND r.rolname IN ('skillsheet_document_reader','skillsheet_document_writer')
  LOOP
    SELECT value INTO original
    FROM jsonb_array_elements(current_setting('vars.owner_memberships')::jsonb)
    WHERE (value->>'roleid')::oid = membership.roleid
      AND (value->>'member')::oid = membership.member
      AND (value->>'grantor')::oid = membership.grantor;
    IF original IS NULL THEN
      EXECUTE format('REVOKE %I FROM %I GRANTED BY %I',
        membership.owner_role, CURRENT_USER, membership.grantor_role);
    ELSIF membership.admin_option IS DISTINCT FROM (original->>'admin')::boolean
       OR membership.inherit_option IS DISTINCT FROM (original->>'inherit')::boolean
       OR membership.set_option IS DISTINCT FROM (original->>'set')::boolean THEN
      EXECUTE format('GRANT %I TO %I WITH ADMIN %s, INHERIT %s, SET %s GRANTED BY %I',
        membership.owner_role, CURRENT_USER,
        original->>'admin', original->>'inherit', original->>'set', membership.grantor_role);
    END IF;
  END LOOP;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'roleid', am.roleid, 'member', am.member, 'grantor', am.grantor,
    'admin', am.admin_option, 'inherit', am.inherit_option, 'set', am.set_option)
    ORDER BY am.roleid, am.member, am.grantor), '[]'::jsonb)
  INTO actual FROM pg_auth_members am JOIN pg_roles r ON r.oid = am.roleid
  WHERE am.member = CURRENT_USER::regrole
    AND r.rolname IN ('skillsheet_document_reader','skillsheet_document_writer');
  IF actual IS DISTINCT FROM current_setting('vars.owner_memberships')::jsonb THEN
    RAISE EXCEPTION 'UNSAFE_ADMIN_MEMBERSHIP_DRIFT' USING ERRCODE = '42501';
  END IF;
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
    -- 認証基表も宣言した4種DML以外の権限（列REFERENCES含む）は与えない。
    OR EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','skillsheet_private') AND c.relkind IN ('r','p','v','m','f')
        AND (has_table_privilege(runtime_oid, c.oid, 'TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(runtime_oid, c.oid, 'REFERENCES')))
    OR EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','skillsheet_private') AND c.relkind = 'S'
        AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(runtime_oid, c.oid, 'SELECT,USAGE,UPDATE') ELSE false END)
    OR EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege(runtime_oid, p.oid, 'EXECUTE'))
    OR EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'skillsheet_private' AND has_function_privilege(runtime_oid, p.oid, 'EXECUTE')
        AND p.oid NOT IN (
          'skillsheet_private.read_snapshot(uuid,text)'::regprocedure,
          'skillsheet_private.list_sheets(text)'::regprocedure,
          'skillsheet_private.replace_sheet(uuid,text,text,jsonb,text)'::regprocedure,
          'skillsheet_private.create_sheet(uuid,text,jsonb,text)'::regprocedure,
          'skillsheet_private.delete_sheet(uuid,text,text)'::regprocedure)
        -- NULLのNOT INで未知関数を見逃さない。未導入signatureは一致しない。
        AND NOT EXISTS (SELECT FROM unnest(ARRAY[
          to_regprocedure('skillsheet_private.history_list(uuid,text,integer,text)'),
          to_regprocedure('skillsheet_private.history_read(uuid,text,text)'),
          to_regprocedure('skillsheet_private.history_count_after(uuid,text,text,text)'),
          to_regprocedure('skillsheet_private.history_restore(uuid,text,text,text)'),
          to_regprocedure('skillsheet_private.deleted_document_list(text)'),
          to_regprocedure('skillsheet_private.restore_deleted_document(uuid,text,text)')
        ]) AS allowed(signature) WHERE allowed.signature = p.oid))
    OR has_database_privilege(runtime_oid, current_database(), 'CREATE')
    -- 明示された将来テーブル/sequenceへの自動grantも、role/PUBLIC経由の漏洩として停止する。
    OR EXISTS (SELECT FROM pg_default_acl d
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      WHERE d.defaclobjtype IN ('r','S') AND (d.defaclnamespace = 0 OR n.nspname IN ('public','skillsheet_private'))
        AND a.grantee IN (0, runtime_oid)
        AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN','USAGE'))
    -- 関数はruntimeへの明示grantだけを検査。PUBLICの組込既定は将来DDLごとに再検査する。
    OR EXISTS (SELECT FROM pg_default_acl d
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      WHERE d.defaclobjtype = 'f' AND (d.defaclnamespace = 0 OR n.nspname IN ('public','skillsheet_private'))
        AND a.grantee = runtime_oid AND a.privilege_type = 'EXECUTE')
    OR has_schema_privilege(runtime_oid, 'public', 'CREATE')
    OR has_schema_privilege(runtime_oid, 'skillsheet_private', 'CREATE')
    OR has_function_privilege(runtime_oid, 'skillsheet_private.checked_blocks(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RUNTIME_BOUNDARY_PERMISSION_LEAK' USING ERRCODE = '42501';
  END IF;
  -- MAINTAINはPG17で追加されたため、PG16では評価しない。
  IF current_setting('server_version_num')::integer >= 170000 THEN
    IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','skillsheet_private') AND c.relkind IN ('r','p','v','m','f')
        AND has_table_privilege(runtime_oid, c.oid, 'MAINTAIN')) THEN
      RAISE EXCEPTION 'RUNTIME_BOUNDARY_PERMISSION_LEAK' USING ERRCODE = '42501';
    END IF;
  END IF;
END
$$;

COMMIT;
