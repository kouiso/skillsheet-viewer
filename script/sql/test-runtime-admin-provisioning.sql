-- 非superuser管理者でも既存管理権を消さず、初回・再設定が成功する。
CREATE ROLE runtime_proof_admin LOGIN CREATEDB CREATEROLE NOINHERIT;
GRANT USAGE, CREATE ON SCHEMA public TO runtime_proof_admin WITH GRANT OPTION;
GRANT USAGE ON SCHEMA skillsheet_private TO runtime_proof_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO runtime_proof_admin WITH GRANT OPTION;
GRANT SELECT, INSERT, UPDATE ON skillsheet_private.principals TO runtime_proof_admin;
GRANT skillsheet_document_reader, skillsheet_document_writer TO runtime_proof_admin
  WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
SET SESSION AUTHORIZATION runtime_proof_admin;
GRANT skillsheet_document_reader, skillsheet_document_writer TO CURRENT_USER
  WITH ADMIN FALSE, INHERIT FALSE, SET FALSE;
CREATE TEMP TABLE runtime_proof_admin_boundary_before AS
 SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
 WHERE member=SESSION_USER::regrole
 AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole);
\set runtime_role runtime_proof_admin_managed
\set runtime_password synthetic-admin-proof-only
\set owner_id runtime-proof-admin-owner
\ir install-runtime-role.sql
\ir install-runtime-role.sql
ALTER ROLE runtime_proof_admin_managed CONNECTION LIMIT 5;
\ir install-runtime-role.sql
SELECT roleid::regrole, member::regrole, grantor::regrole, admin_option, inherit_option, set_option
FROM pg_auth_members WHERE roleid = 'runtime_proof_admin_managed'::regrole;
DO $$
BEGIN
  IF EXISTS (
    (SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
     WHERE member=SESSION_USER::regrole
     AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole)
     EXCEPT SELECT * FROM runtime_proof_admin_boundary_before)
    UNION ALL
    (SELECT * FROM runtime_proof_admin_boundary_before
     EXCEPT SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
     WHERE member=SESSION_USER::regrole
     AND roleid IN('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole))
  ) THEN
    RAISE EXCEPTION 'Complete boundary membership snapshot changed';
  END IF;
  IF (SELECT rolconnlimit FROM pg_roles WHERE rolname='runtime_proof_admin_managed') <> 5 THEN
    RAISE EXCEPTION 'Finite connection limit changed on reinstall';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members WHERE member = 'runtime_proof_admin_managed'::regrole) THEN
    RAISE EXCEPTION 'Runtime inherited an elevated role';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_auth_members
    WHERE roleid = 'runtime_proof_admin_managed'::regrole AND member = SESSION_USER::regrole
      AND admin_option AND NOT inherit_option AND NOT set_option) THEN
    RAISE EXCEPTION 'Provisioner lost runtime management membership';
  END IF;
  IF (SELECT count(DISTINCT roleid) FROM pg_auth_members
    WHERE member = SESSION_USER::regrole
      AND roleid IN ('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole)
      AND admin_option AND NOT inherit_option AND NOT set_option) <> 2 THEN
    RAISE EXCEPTION 'Existing boundary owner memberships changed';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members
    WHERE member = SESSION_USER::regrole
      AND roleid IN ('skillsheet_document_reader'::regrole,'skillsheet_document_writer'::regrole)
      AND (inherit_option OR set_option OR (grantor = SESSION_USER::regrole AND admin_option))) THEN
    RAISE EXCEPTION 'Boundary owner membership options changed';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;

-- 別grantorから第三者へruntime管理権を付与し、非superuser再設定の拒否を別接続で検証する。
CREATE ROLE runtime_proof_guest;
GRANT runtime_proof_admin_managed TO runtime_proof_guest WITH INHERIT FALSE, SET TRUE;
