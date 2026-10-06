#!/usr/bin/env bash
# 新規ローカルclusterだけに接続する。秘密値・既存DATABASE_URLを使用しない。
set -euo pipefail
umask 077
pg_major="$(initdb --version | sed -E 's/.* ([0-9]+)\..*/\1/')"
if (( pg_major < 16 )); then printf 'PostgreSQL 16以上のbinをPATHへ指定してください。\n' >&2; exit 1; fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
run_dir="$(mktemp -d /tmp/skillsheet-history-managed.XXXXXX)"
for pg_variable in ${!PG@}; do unset "$pg_variable"; done
unset DATABASE_URL
cleanup() { if [[ -f "$run_dir/data/postmaster.pid" ]]; then pg_ctl -D "$run_dir/data" -m fast -w stop >>"$run_dir/server.log" 2>&1; fi; }
trap cleanup EXIT
initdb -D "$run_dir/data" -U history_admin --auth=trust --no-locale -E UTF8 >"$run_dir/init.log" 2>&1
pg_ctl -D "$run_dir/data" -l "$run_dir/server.log" -o "-c listen_addresses='' -k '$run_dir' -p 55449" -w start >/dev/null
psql -X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55449 -U history_admin -d postgres >"$run_dir/bootstrap.log" <<'SQL'
CREATE ROLE managed_admin LOGIN NOSUPERUSER CREATEROLE CREATEDB BYPASSRLS INHERIT;
CREATE DATABASE managed_review OWNER managed_admin;
SQL
args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55449 -U managed_admin -d managed_review)
printf '私用証跡: %s\n' "$run_dir"
for migration in "$repo_dir"/drizzle/migration/*.sql; do psql "${args[@]}" -f "$migration" >>"$run_dir/migration.log" 2>&1; done
for stage in install-skillsheet-read-boundary install-skillsheet-write-boundary; do
 psql "${args[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/$stage.log" 2>&1
 printf '%s: PASS\n' "$stage"
done


# 明示指定できるのは合成membershipケースだけ。接続先引数は受け付けない。
mode="${1:-clean}"
if [[ "$mode" != clean && "$mode" != preserved && "$mode" != inherited ]]; then echo 'mode must be clean, preserved or inherited' >&2; exit 1; fi
if [[ "$mode" == preserved ]]; then
 psql "${args[@]}" >"$run_dir/existing-membership.log" <<'SQL'
GRANT skillsheet_document_reader,skillsheet_document_writer TO CURRENT_USER WITH SET TRUE GRANTED BY CURRENT_USER;
GRANT CREATE ON SCHEMA skillsheet_private TO skillsheet_document_writer;
GRANT skillsheet_document_reader,skillsheet_document_writer TO CURRENT_USER WITH SET FALSE GRANTED BY CURRENT_USER;
GRANT skillsheet_document_reader,skillsheet_document_writer TO CURRENT_USER WITH INHERIT FALSE GRANTED BY CURRENT_USER;
SQL
fi
if [[ "$mode" == inherited ]]; then
 psql "${args[@]}" >"$run_dir/inherited-create.log" <<'SQL'
GRANT skillsheet_document_reader TO CURRENT_USER WITH INHERIT TRUE GRANTED BY CURRENT_USER;
CREATE ROLE synthetic_schema_source NOLOGIN;
GRANT CREATE ON SCHEMA skillsheet_private TO synthetic_schema_source;
GRANT synthetic_schema_source TO skillsheet_document_writer WITH INHERIT TRUE;
SQL
fi
schema_acl() {
 psql "${args[@]}" -At -c "SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type,is_grantable)::text) FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='skillsheet_private';"
}
membership() {
 psql "${args[@]}" -At -c "SELECT md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor)::text,'[]')) FROM pg_auth_members m WHERE member=(SELECT oid FROM pg_roles WHERE rolname='managed_admin') AND roleid IN(SELECT oid FROM pg_roles WHERE rolname IN('skillsheet_document_reader','skillsheet_document_writer'));"
}
boundary_acl() {
 psql "${args[@]}" -At -c "SELECT md5(jsonb_agg(jsonb_build_array(p.proname,p.proacl) ORDER BY p.proname)::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='skillsheet_private' AND p.proname IN('read_snapshot','list_sheets','create_sheet','replace_sheet','delete_sheet');"
}
membership >"$run_dir/membership-before"
boundary_acl >"$run_dir/acl-before"
schema_acl >"$run_dir/schema-before"
# 権限を借りた直後の失敗でも全membershipが元に戻る。
sed '/^CREATE FUNCTION skillsheet_private.capture_document(/i SELECT 1/0;' "$repo_dir/script/sql/install-document-history.sql" >"$run_dir/injected-failure.sql"
if psql "${args[@]}" -f "$run_dir/injected-failure.sql" >"$run_dir/injected-failure.log" 2>&1; then echo 'failure injection did not fail' >&2; exit 1; fi
membership >"$run_dir/membership-after-failure"
cmp "$run_dir/membership-before" "$run_dir/membership-after-failure"
if [[ "$mode" == inherited ]]; then
 if psql "${args[@]}" -f "$repo_dir/script/sql/install-document-history.sql" >"$run_dir/install-document-history.log" 2>&1; then echo 'unexpected inherited CREATE success' >&2; exit 1; fi
 grep -q 'must preserve existing schema ACL' "$run_dir/install-document-history.log"
 membership >"$run_dir/membership-after-rejection"
 schema_acl >"$run_dir/schema-after-rejection"
 cmp "$run_dir/membership-before" "$run_dir/membership-after-rejection"
 cmp "$run_dir/schema-before" "$run_dir/schema-after-rejection"
 psql "${args[@]}" >"$run_dir/rollback-assert.log" <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='skillsheet_private' AND p.proname='capture_document')
 OR EXISTS(SELECT FROM pg_trigger WHERE tgname LIKE 'document_history_%') THEN RAISE EXCEPTION 'partial installer remains';END IF;
END $$;
SQL
 printf 'managed installer (inherited): unsupported ACL fails closed, membership/schema/DDL rollback PASS\n'
 exit 0
fi
psql "${args[@]}" -f "$repo_dir/script/sql/install-document-history.sql" >"$run_dir/install-document-history.log" 2>&1
schema_acl >"$run_dir/schema-after-success"
cmp "$run_dir/schema-before" "$run_dir/schema-after-success"
membership >"$run_dir/membership-after-success"
boundary_acl >"$run_dir/acl-after"
cmp "$run_dir/membership-before" "$run_dir/membership-after-success"
cmp "$run_dir/acl-before" "$run_dir/acl-after"
psql "${args[@]}" -v preserved="$mode" >"$run_dir/security-assert.log" <<'SQL'
SELECT set_config('review.mode', :'preserved', false);
DO $$ DECLARE total int; BEGIN
 SELECT count(*) INTO total FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='skillsheet_private' AND p.proname IN('capture_document','capture_document_blocks','capture_document_trigger','history_owner','history_list','history_read','history_count_after','history_restore','deleted_document_list','restore_deleted_document')
 AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='skillsheet_document_writer')
 AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, skillsheet_private, pg_temp'];
 IF total IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'owner/definer/search_path changed';END IF;
 IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE n.nspname='skillsheet_private' AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'public function execute';END IF;
 IF has_schema_privilege('skillsheet_document_writer','skillsheet_private','CREATE') IS DISTINCT FROM (current_setting('review.mode')='preserved') THEN RAISE EXCEPTION 'schema privilege changed';END IF;
END $$;
SQL
# installer成功後の再実行失敗もmembershipを残さない。
if psql "${args[@]}" -f "$repo_dir/script/sql/install-document-history.sql" >"$run_dir/reinstall.log" 2>&1; then echo 'unexpected reinstall success' >&2; exit 1; fi
membership >"$run_dir/membership-after-reinstall"
cmp "$run_dir/membership-before" "$run_dir/membership-after-reinstall"
# SESSION AUTHORIZATIONを用いる既存の合成runtime試験はbootstrap管理接続から実行。
for stage in test-skillsheet-read-boundary test-skillsheet-write-boundary test-document-history; do
 psql -X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55449 -U history_admin -d managed_review -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/$stage.log" 2>&1
done
printf 'managed installer (%s): migration/boundary/history, failure rollback, membership/ACL/owner preservation, runtime tests PASS
' "$mode"
