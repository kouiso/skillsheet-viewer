-- 新規合成cluster専用。LOGIN管理者の全grantor membershipを初回・再実行で維持する。
CREATE ROLE runtime_proof_second_superuser LOGIN SUPERUSER;
CREATE ROLE runtime_proof_second_superuser_prior LOGIN SUPERUSER;
GRANT skillsheet_document_reader,skillsheet_document_writer TO runtime_proof_second_superuser_prior
 WITH ADMIN FALSE,INHERIT FALSE,SET FALSE;
CREATE ROLE runtime_proof_boundary_mgr NOLOGIN;
GRANT skillsheet_document_reader,skillsheet_document_writer TO runtime_proof_boundary_mgr
 WITH ADMIN TRUE,INHERIT FALSE,SET FALSE;
CREATE ROLE runtime_proof_via_mgr LOGIN CREATEDB CREATEROLE INHERIT;
CREATE ROLE runtime_proof_via_mgr_prior LOGIN CREATEDB CREATEROLE INHERIT;
GRANT runtime_proof_boundary_mgr TO runtime_proof_via_mgr,runtime_proof_via_mgr_prior
 WITH INHERIT TRUE,SET FALSE;
GRANT USAGE,CREATE ON SCHEMA public TO runtime_proof_via_mgr,runtime_proof_via_mgr_prior WITH GRANT OPTION;
GRANT USAGE ON SCHEMA skillsheet_private TO runtime_proof_via_mgr,runtime_proof_via_mgr_prior;
GRANT ALL ON ALL TABLES IN SCHEMA public TO runtime_proof_via_mgr,runtime_proof_via_mgr_prior WITH GRANT OPTION;
GRANT SELECT,INSERT,UPDATE ON skillsheet_private.principals TO runtime_proof_via_mgr,runtime_proof_via_mgr_prior;
SET ROLE runtime_proof_boundary_mgr;
GRANT skillsheet_document_reader,skillsheet_document_writer TO runtime_proof_via_mgr_prior
 WITH ADMIN FALSE,INHERIT FALSE,SET FALSE;
RESET ROLE;
CREATE ROLE runtime_proof_nocreatedb LOGIN CREATEROLE NOCREATEDB NOINHERIT;
GRANT USAGE,CREATE ON SCHEMA public TO runtime_proof_nocreatedb WITH GRANT OPTION;
GRANT USAGE ON SCHEMA skillsheet_private TO runtime_proof_nocreatedb;
GRANT ALL ON ALL TABLES IN SCHEMA public TO runtime_proof_nocreatedb WITH GRANT OPTION;
GRANT SELECT,INSERT,UPDATE ON skillsheet_private.principals TO runtime_proof_nocreatedb;
GRANT skillsheet_document_reader,skillsheet_document_writer TO runtime_proof_nocreatedb
 WITH ADMIN TRUE,INHERIT FALSE,SET FALSE;
\connect - runtime_proof_second_superuser
SELECT coalesce(jsonb_agg(jsonb_build_object(
 'roleid',roleid,'member',member,'grantor',grantor,
 'admin',admin_option,'inherit',inherit_option,'set',set_option)
 ORDER BY roleid,member,grantor),'[]'::jsonb) AS boundary_before
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole)
\gset
\set runtime_role runtime_proof_second_superuser_runtime
\set runtime_password synthetic-grantor-proof-only
\set owner_id runtime-proof-grantor-owner
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\connect - boundary_admin
\connect - runtime_proof_second_superuser_prior
SELECT coalesce(jsonb_agg(jsonb_build_object(
 'roleid',roleid,'member',member,'grantor',grantor,
 'admin',admin_option,'inherit',inherit_option,'set',set_option)
 ORDER BY roleid,member,grantor),'[]'::jsonb) AS boundary_before
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole)
\gset
\set runtime_role runtime_proof_second_superuser_prior_runtime
\set runtime_password synthetic-grantor-proof-only
\set owner_id runtime-proof-grantor-owner
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\connect - boundary_admin
\connect - runtime_proof_via_mgr
SELECT coalesce(jsonb_agg(jsonb_build_object(
 'roleid',roleid,'member',member,'grantor',grantor,
 'admin',admin_option,'inherit',inherit_option,'set',set_option)
 ORDER BY roleid,member,grantor),'[]'::jsonb) AS boundary_before
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole)
\gset
\set runtime_role runtime_proof_via_mgr_runtime
\set runtime_password synthetic-grantor-proof-only
\set owner_id runtime-proof-grantor-owner
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\connect - boundary_admin
\connect - runtime_proof_via_mgr_prior
SELECT coalesce(jsonb_agg(jsonb_build_object(
 'roleid',roleid,'member',member,'grantor',grantor,
 'admin',admin_option,'inherit',inherit_option,'set',set_option)
 ORDER BY roleid,member,grantor),'[]'::jsonb) AS boundary_before
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole)
\gset
\set runtime_role runtime_proof_via_mgr_prior_runtime
\set runtime_password synthetic-grantor-proof-only
\set owner_id runtime-proof-grantor-owner
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\connect - boundary_admin
\connect - runtime_proof_nocreatedb
SELECT coalesce(jsonb_agg(jsonb_build_object(
 'roleid',roleid,'member',member,'grantor',grantor,
 'admin',admin_option,'inherit',inherit_option,'set',set_option)
 ORDER BY roleid,member,grantor),'[]'::jsonb) AS boundary_before
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole)
\gset
\set runtime_role runtime_proof_nocreatedb_runtime
\set runtime_password synthetic-grantor-proof-only
\set owner_id runtime-proof-grantor-owner
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\ir install-runtime-role.sql
SELECT set_config('proof.boundary_before', :'boundary_before', false);
DO $$
DECLARE actual jsonb; runtime_oid oid:=current_setting('vars.runtime_role')::regrole;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'roleid',roleid,'member',member,'grantor',grantor,
  'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY roleid,member,grantor),'[]'::jsonb) INTO actual
 FROM pg_auth_members WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
 IF actual IS DISTINCT FROM current_setting('proof.boundary_before')::jsonb THEN
  RAISE EXCEPTION 'Complete grantor membership changed for %: before %, after %',
   SESSION_USER,current_setting('proof.boundary_before'),actual;
 END IF;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=runtime_oid
  OR (roleid=runtime_oid AND member<>SESSION_USER::regrole)) THEN
  RAISE EXCEPTION 'Runtime boundary membership or foreign administrator leaked';
 END IF;
 IF NOT has_function_privilege(runtime_oid,'skillsheet_private.create_sheet(uuid,text,jsonb,text)','EXECUTE')
  OR has_table_privilege(runtime_oid,'public.skill_sheets','SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Runtime effective permission contract changed';
 END IF;
END $$;
\connect - boundary_admin
DELETE FROM skillsheet_private.principals WHERE login_name IN('runtime_proof_nocreatedb_runtime','runtime_proof_second_superuser_runtime','runtime_proof_second_superuser_prior_runtime','runtime_proof_via_mgr_runtime','runtime_proof_via_mgr_prior_runtime');
DROP OWNED BY runtime_proof_nocreatedb,runtime_proof_nocreatedb_runtime,runtime_proof_second_superuser_runtime,runtime_proof_second_superuser_prior_runtime,runtime_proof_via_mgr_runtime,runtime_proof_via_mgr_prior_runtime,runtime_proof_second_superuser,runtime_proof_second_superuser_prior,runtime_proof_via_mgr,runtime_proof_via_mgr_prior,runtime_proof_boundary_mgr;
DROP ROLE runtime_proof_nocreatedb_runtime,runtime_proof_second_superuser_runtime,runtime_proof_second_superuser_prior_runtime,runtime_proof_via_mgr_runtime,runtime_proof_via_mgr_prior_runtime;
SET ROLE runtime_proof_boundary_mgr;
REVOKE skillsheet_document_reader,skillsheet_document_writer FROM runtime_proof_via_mgr_prior;
RESET ROLE;
REVOKE skillsheet_document_reader,skillsheet_document_writer FROM runtime_proof_second_superuser_prior,runtime_proof_boundary_mgr,runtime_proof_nocreatedb;
DROP ROLE runtime_proof_nocreatedb,runtime_proof_second_superuser,runtime_proof_second_superuser_prior,runtime_proof_via_mgr,runtime_proof_via_mgr_prior,runtime_proof_boundary_mgr;
