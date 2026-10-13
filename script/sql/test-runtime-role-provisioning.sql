-- 新規隔離cluster専用。実際のruntime installを初回・再実行で検証する。
\set runtime_role runtime_proof_runtime
\set runtime_password synthetic-verification-only
\set owner_id runtime-proof-owner
\ir install-runtime-role.sql

-- 再実行前に、過去の手作業で残りうる属性・権限・membershipを再現する。
ALTER ROLE runtime_proof_runtime CREATEDB CREATEROLE INHERIT;
CREATE ROLE runtime_proof_member;
GRANT skillsheet_document_reader, skillsheet_document_writer TO runtime_proof_runtime WITH SET TRUE;
GRANT runtime_proof_runtime TO runtime_proof_member WITH SET TRUE;
GRANT ALL ON ALL TABLES IN SCHEMA public TO runtime_proof_runtime;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO runtime_proof_runtime;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO runtime_proof_runtime;
GRANT ALL ON ALL TABLES IN SCHEMA skillsheet_private TO runtime_proof_runtime;
GRANT EXECUTE ON FUNCTION skillsheet_private.checked_blocks(jsonb) TO runtime_proof_runtime;
GRANT CREATE ON SCHEMA public, skillsheet_private TO runtime_proof_runtime;
GRANT CREATE ON DATABASE postgres TO runtime_proof_runtime;
\ir install-runtime-role.sql

DO $$
DECLARE runtime_oid oid := 'runtime_proof_runtime'::regrole;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE oid = runtime_oid AND
    (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)) THEN
    RAISE EXCEPTION 'Runtime role attributes did not converge';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members WHERE member = runtime_oid OR roleid = runtime_oid) THEN
    RAISE EXCEPTION 'Runtime membership survived provisioning';
  END IF;
  IF has_database_privilege(runtime_oid, current_database(), 'CREATE')
    OR has_schema_privilege(runtime_oid, 'public', 'CREATE')
    OR has_schema_privilege(runtime_oid, 'skillsheet_private', 'CREATE') THEN
    RAISE EXCEPTION 'Runtime schema CREATE survived provisioning';
  END IF;
  IF EXISTS (SELECT FROM unnest(ARRAY['public."user"','public.drive_destination']) AS relation(name)
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS permission(name)
    WHERE NOT has_table_privilege(runtime_oid, relation.name, permission.name)) THEN
    RAISE EXCEPTION 'Required auth and Drive privileges missing';
  END IF;
END
$$;

SET SESSION AUTHORIZATION runtime_proof_runtime;
DO $$
DECLARE
  relation text;
  r jsonb;
  target uuid := '78787878-7878-4787-8787-787878787878';
BEGIN
  IF SESSION_USER <> 'runtime_proof_runtime' THEN RAISE EXCEPTION 'Not actual runtime principal'; END IF;
  FOREACH relation IN ARRAY ARRAY['skill_sheets', 'blocks', 'skillsheet_state'] LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', relation);
      RAISE EXCEPTION 'Direct SELECT permitted on %', relation;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    UPDATE public.skill_sheets SET title = title WHERE false;
    RAISE EXCEPTION 'Direct document UPDATE permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.blocks (sheet_id, type, data) VALUES (target, 'markdown', '{}'::jsonb);
    RAISE EXCEPTION 'Direct block INSERT permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.skillsheet_state WHERE false;
    RAISE EXCEPTION 'Direct state DELETE permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SET ROLE skillsheet_document_writer';
    RAISE EXCEPTION 'SET ROLE permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM skillsheet_private.checked_blocks('[]');
    RAISE EXCEPTION 'Internal validator EXECUTE permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF skillsheet_private.read_snapshot(NULL, 'runtime-proof-owner')->>'status' IS DISTINCT FROM 'EMPTY'
    OR skillsheet_private.list_sheets('runtime-proof-owner') IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Runtime read functions failed';
  END IF;
  r := skillsheet_private.create_sheet(target, '合成文書', '[]', 'runtime-proof-owner');
  IF r#>>'{snapshot,revision}' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Runtime create failed'; END IF;
  r := skillsheet_private.replace_sheet(target, '0', '合成更新', '[]', 'runtime-proof-owner');
  IF r#>>'{snapshot,revision}' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Runtime replace failed'; END IF;
  IF skillsheet_private.delete_sheet(target, '1', 'runtime-proof-owner')->>'status' IS DISTINCT FROM 'OK'
    OR skillsheet_private.create_sheet(target, '合成再送', '[]', 'runtime-proof-owner')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN
    RAISE EXCEPTION 'Runtime delete or tombstone failed';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;
