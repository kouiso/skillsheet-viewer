#!/usr/bin/env bash
# 新規ローカルcluster専用。DATABASE_URLや既存DBを使わず、合成fixtureで限定APIを検証する。
set -euo pipefail
umask 077
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
verification_dir="${XDG_DATA_HOME:-$HOME/.local/share}/skillsheet-viewer/verification"
mkdir -p -- "$verification_dir"
run_dir="$(mktemp -d "$verification_dir/db-check.XXXXXX")"
# libpqの接続先・サービス・資格情報を継承しない。接続は新clusterのsocketへ固定する。
for pg_variable in ${!PG@}; do unset "$pg_variable"; done
unset DATABASE_URL
for binary in initdb pg_ctl psql pg_dumpall rg pnpm cmp; do command -v "$binary" >/dev/null; done
cleanup() {
  local cleanup_result=0
  for cluster in data restored history-data pgstat-data; do
    if [[ -f "$run_dir/$cluster/postmaster.pid" ]]; then
      pg_ctl -D "$run_dir/$cluster" -m fast -w stop >>"$run_dir/server.log" 2>&1 || cleanup_result=1
    fi
  done
  return "$cleanup_result"
}
finish() {
  result=$?
  cleanup || result=1
  if (( result != 0 )); then printf '検証失敗。私有ログ: %s\n' "$run_dir" >&2; fi
  exit "$result"
}
trap finish EXIT
initdb -D "$run_dir/data" -U boundary_admin --auth=trust --no-locale -E UTF8 >"$run_dir/init.log" 2>&1
# TCPを無効化。0700のsocket directoryへアクセスできる同一OS利用者だけが接続できる。
pg_ctl -D "$run_dir/data" -l "$run_dir/server.log" -o "-c listen_addresses='' -k '$run_dir' -p 55440" -w start >/dev/null
psql_args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55440 -U boundary_admin -d postgres)
for migration in "$repo_dir"/drizzle/migration/*.sql; do
  psql "${psql_args[@]}" -f "$migration" >>"$run_dir/migrations.log" 2>&1
done
for stage in install-skillsheet-read-boundary install-skillsheet-write-boundary test-skillsheet-read-boundary test-skillsheet-write-boundary; do
  psql "${psql_args[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/$stage.log" 2>&1
  printf '%s: PASS\n' "$stage"
done
psql "${psql_args[@]}" -f "$repo_dir/script/sql/test-runtime-role-provisioning.sql" >"$run_dir/runtime-provisioning.log" 2>&1
printf "runtime install再実行・実効権限・正規文書操作: PASS\n"
psql "${psql_args[@]}" -f "$repo_dir/script/sql/test-runtime-admin-provisioning.sql" >"$run_dir/runtime-admin-provisioning.log" 2>&1
printf "非superuser管理者の初回・再実行・membership維持: PASS\n"
# 接続管理者自身をruntimeに指定しても、属性・password・membershipを変えず拒否する。
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/self-runtime.before"
if psql "${psql_args[@]}" -U runtime_proof_admin -v runtime_role=runtime_proof_admin   -v runtime_password=synthetic-self-proof-only -v owner_id=runtime-proof-admin-owner   -f "$repo_dir/script/sql/install-runtime-role.sql" >"$run_dir/self-runtime.log" 2>&1; then
  printf '管理者自身をruntimeへ変更できました\n' >&2
  exit 1
fi
rg -q UNSAFE_RUNTIME_ROLE "$run_dir/self-runtime.log"
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/self-runtime.after"
cmp "$run_dir/self-runtime.before" "$run_dir/self-runtime.after"
printf '管理者自身のruntime化を拒否・rollback: PASS\n'
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/foreign-manager.before"
if psql "${psql_args[@]}" -U runtime_proof_admin -v runtime_role=runtime_proof_admin_managed \
  -v runtime_password=synthetic-admin-proof-only -v owner_id=runtime-proof-admin-owner \
  -f "$repo_dir/script/sql/install-runtime-role.sql" >"$run_dir/foreign-manager.log" 2>&1; then
  printf '別grantorのruntime管理権が残っているのにinstallが成功しました\n' >&2
  exit 1
fi
rg -q RUNTIME_BOUNDARY_PERMISSION_LEAK "$run_dir/foreign-manager.log"
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/foreign-manager.after"
cmp "$run_dir/foreign-manager.before" "$run_dir/foreign-manager.after"
psql "${psql_args[@]}" >"$run_dir/runtime-admin-cleanup.log" 2>&1 <<'SQL'
DELETE FROM skillsheet_private.principals WHERE login_name = 'runtime_proof_admin_managed';
DROP OWNED BY runtime_proof_admin_managed, runtime_proof_admin, runtime_proof_guest;
DROP ROLE runtime_proof_admin_managed, runtime_proof_admin, runtime_proof_guest;
SQL
printf '別grantorの管理membership残存を拒否・rollback: PASS\n'
psql "${psql_args[@]}" -f "$repo_dir/script/sql/test-runtime-admin-grantor-provisioning.sql" >"$run_dir/runtime-admin-grantor-provisioning.log" 2>&1
printf '別superuser・継承ADMIN・全grantor membership維持: PASS\n'
# 管理権のない別LOGINへの拒否は、passwordをエラーへ出さず同じ接続のGUCも消す。
psql "${psql_args[@]}" >"$run_dir/password-denial-fixture.log" 2>&1 <<'SQL'
CREATE ROLE runtime_proof_password_admin LOGIN CREATEROLE NOCREATEDB NOINHERIT;
CREATE ROLE runtime_proof_foreign_password_manager LOGIN CREATEROLE NOCREATEDB NOINHERIT;
SQL
psql "${psql_args[@]}" -U runtime_proof_foreign_password_manager \
  -c 'CREATE ROLE runtime_proof_password_target LOGIN NOCREATEDB NOCREATEROLE NOINHERIT' \
  >"$run_dir/password-foreign-role.log" 2>&1
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/password-denial.before"
psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/password-roles.before"
psql "${psql_args[@]}" -U runtime_proof_password_admin -v VERBOSITY=verbose \
  -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
  >"$run_dir/password-denial.log" 2>&1 <<'SQL'
\set ON_ERROR_STOP off
\set runtime_role runtime_proof_password_target
\set runtime_password synthetic-f3-redaction-marker
\set owner_id runtime-proof-password-owner
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_FAILURE';
 END IF;
END $$;
SQL
# wrapperのexitだけでは失敗を証明できない。元SQLSTATE・秘匿message・全catalog一致を確認する。
rg -q 'ERROR:  42501:.*RUNTIME_ROLE_ATTRIBUTE_UPDATE_FAILED' "$run_dir/password-denial.log"
if rg -q 'synthetic-f3-redaction-marker' "$run_dir/password-denial.log" "$run_dir/server.log"; then
  printf '拒否時に合成passwordがログへ露出しました\n' >&2
  exit 1
fi
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/password-denial.after"
psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/password-roles.after"
cmp "$run_dir/password-denial.before" "$run_dir/password-denial.after"
cmp "$run_dir/password-roles.before" "$run_dir/password-roles.after"
# OTHERSだけでは57014を捕捉しない。実ALTER ROLEのLock待機を取消して秘匿を検証する。
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/password-cancel.before"
psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/password-cancel-roles.before"
mkfifo "$run_dir/password-cancel.fifo"
PGAPPNAME=password-cancel-locker psql "${psql_args[@]}" \
  <"$run_dir/password-cancel.fifo" >"$run_dir/password-cancel-locker.log" 2>&1 &
password_locker_pid=$!
exec {password_locker_fd}>"$run_dir/password-cancel.fifo"
printf 'BEGIN;\nALTER ROLE runtime_proof_password_target CONNECTION LIMIT 7;\n' >&"$password_locker_fd"
password_locker_seen=false
for ((attempt=0; attempt<150; attempt++)); do
  if [[ "$(psql "${psql_args[@]}" -At -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='password-cancel-locker' AND state='idle in transaction'")" == 1 ]]; then
    password_locker_seen=true; break
  fi
  sleep 0.01
done
[[ "$password_locker_seen" == true ]]
PGAPPNAME=password-cancel-installer psql "${psql_args[@]}" -U runtime_proof_foreign_password_manager \
  -v VERBOSITY=verbose -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
  >"$run_dir/password-cancel.log" 2>&1 <<'SQL' &
\set ON_ERROR_STOP off
\set runtime_role runtime_proof_password_target
\set runtime_password synthetic-cancel-redaction-marker
\set owner_id runtime-proof-password-owner
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PASSWORD_GUC_SURVIVED_CANCELLATION';
 END IF;
END $$;
SELECT 'PASSWORD_GUC_EMPTY_PASS';
SQL
password_cancel_pid=$!
password_wait_seen=false
for ((attempt=0; attempt<150; attempt++)); do
  if [[ "$(psql "${psql_args[@]}" -At -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='password-cancel-installer' AND wait_event_type='Lock'")" == 1 ]]; then
    password_wait_seen=true; break
  fi
  sleep 0.01
done
[[ "$password_wait_seen" == true ]]
[[ "$(psql "${psql_args[@]}" -At -c "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='password-cancel-installer' AND wait_event_type='Lock'")" == t ]]
wait "$password_cancel_pid"
printf 'ROLLBACK;\n\\q\n' >&"$password_locker_fd"
exec {password_locker_fd}>&-
wait "$password_locker_pid"
password_cancel_first_error="$(rg -m1 'ERROR:' "$run_dir/password-cancel.log")"
[[ "$password_cancel_first_error" == *'ERROR:  57014:'*'RUNTIME_ROLE_ATTRIBUTE_UPDATE_FAILED'* ]]
rg -q PASSWORD_GUC_EMPTY_PASS "$run_dir/password-cancel.log"
if rg -q 'synthetic-cancel-redaction-marker' "$run_dir/password-cancel.log" "$run_dir/server.log"; then
  printf '取消時に合成passwordがログへ露出しました\n' >&2
  exit 1
fi
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/password-cancel.after"
psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/password-cancel-roles.after"
cmp "$run_dir/password-cancel.before" "$run_dir/password-cancel.after"
cmp "$run_dir/password-cancel-roles.before" "$run_dir/password-cancel-roles.after"
printf '実Lock待機の取消・57014維持・password秘匿・GUC消去・全catalog一致: PASS\n'
# lock待機ログがpassword入りDDLを記録する前に、credential更新をtimeoutで止める。
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/password-lock-log.before"
psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/password-lock-log-roles.before"
mkfifo "$run_dir/password-lock-log.fifo"
PGAPPNAME=password-log-locker psql "${psql_args[@]}" \
  <"$run_dir/password-lock-log.fifo" >"$run_dir/password-log-locker.log" 2>&1 &
password_log_locker_pid=$!
exec {password_log_locker_fd}>"$run_dir/password-lock-log.fifo"
printf 'BEGIN;\nALTER ROLE runtime_proof_password_target CONNECTION LIMIT 7;\n' >&"$password_log_locker_fd"
password_log_locker_seen=false
for ((attempt=0; attempt<150; attempt++)); do
  if [[ "$(psql "${psql_args[@]}" -At -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='password-log-locker' AND state='idle in transaction'")" == 1 ]]; then
    password_log_locker_seen=true; break
  fi
  sleep 0.01
done
[[ "$password_log_locker_seen" == true ]]
PGAPPNAME=password-log-installer psql "${psql_args[@]}" -v VERBOSITY=verbose \
  -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
  -c "SET log_lock_waits=on; SET deadlock_timeout='1s'; SET lock_timeout='5s';" -f - \
  >"$run_dir/password-lock-log.log" 2>&1 <<'SQL' &
\set ON_ERROR_STOP off
\set runtime_role runtime_proof_password_target
\set runtime_password synthetic-lock-log-redaction-marker
\set owner_id runtime-proof-password-owner
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>''
  OR current_setting('lock_timeout')<>'5s'
  OR current_setting('log_lock_waits')<>'on'
  OR current_setting('deadlock_timeout')<>'1s' THEN
  RAISE EXCEPTION 'PASSWORD_LOCK_LOG_SESSION_STATE_CHANGED';
 END IF;
END $$;
SELECT 'PASSWORD_LOCK_LOG_STATE_PASS';
SQL
password_log_installer_pid=$!
password_log_wait_seen=false
for ((attempt=0; attempt<150; attempt++)); do
  if [[ "$(psql "${psql_args[@]}" -At -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='password-log-installer' AND wait_event_type='Lock'")" == 1 ]]; then
    password_log_wait_seen=true; break
  fi
  sleep 0.01
done
[[ "$password_log_wait_seen" == true ]]
wait "$password_log_installer_pid"
printf 'ROLLBACK;\n\\q\n' >&"$password_log_locker_fd"
exec {password_log_locker_fd}>&-
wait "$password_log_locker_pid"
password_log_first_error="$(rg -m1 'ERROR:' "$run_dir/password-lock-log.log")"
[[ "$password_log_first_error" == *'ERROR:  55P03:'*'RUNTIME_ROLE_ATTRIBUTE_UPDATE_FAILED'* ]]
rg -q PASSWORD_LOCK_LOG_STATE_PASS "$run_dir/password-lock-log.log"
if rg -q 'synthetic-lock-log-redaction-marker' "$run_dir/password-lock-log.log" "$run_dir/server.log"; then
  printf 'lock待機ログに合成passwordが露出しました\n' >&2
  exit 1
fi
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/password-lock-log.after"
psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/password-lock-log-roles.after"
cmp "$run_dir/password-lock-log.before" "$run_dir/password-lock-log.after"
cmp "$run_dir/password-lock-log-roles.before" "$run_dir/password-lock-log-roles.after"
# deadlock_timeout=1msは先行できる正のms値がないため、credential DDL前に拒否する。
psql "${psql_args[@]}" -v VERBOSITY=verbose -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
  -c "SET log_lock_waits=on; SET deadlock_timeout='1ms'; SET lock_timeout='5s';" -f - \
  >"$run_dir/password-lock-log-minimum.log" 2>&1 <<'SQL'
\set ON_ERROR_STOP off
\set runtime_role runtime_proof_password_target
\set runtime_password synthetic-lock-log-minimum-marker
\set owner_id runtime-proof-password-owner
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>''
  OR current_setting('lock_timeout')<>'5s'
  OR current_setting('log_lock_waits')<>'on'
  OR current_setting('deadlock_timeout')<>'1ms' THEN
  RAISE EXCEPTION 'PASSWORD_LOCK_LOG_MINIMUM_STATE_CHANGED';
 END IF;
END $$;
SELECT 'PASSWORD_LOCK_LOG_MINIMUM_PASS';
SQL
password_log_minimum_error="$(rg -m1 'ERROR:' "$run_dir/password-lock-log-minimum.log")"
[[ "$password_log_minimum_error" == *'ERROR:  42501:'*'UNSAFE_RUNTIME_PASSWORD_LOGGING'* ]]
rg -q PASSWORD_LOCK_LOG_MINIMUM_PASS "$run_dir/password-lock-log-minimum.log"
if rg -q 'synthetic-lock-log-minimum-marker' "$run_dir/password-lock-log-minimum.log" "$run_dir/server.log"; then
  printf '最小lock待機設定の拒否で合成passwordが露出しました\n' >&2
  exit 1
fi
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/password-lock-log-minimum.after"
psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/password-lock-log-minimum-roles.after"
cmp "$run_dir/password-lock-log.before" "$run_dir/password-lock-log-minimum.after"
cmp "$run_dir/password-lock-log-roles.before" "$run_dir/password-lock-log-minimum-roles.after"
# 成功時も元の5sと管理者のsession設定を維持する。
psql "${psql_args[@]}" -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
  -c "SET log_lock_waits=on; SET deadlock_timeout='1s'; SET lock_timeout='5s';" -f - \
  >"$run_dir/password-lock-log-success.log" 2>&1 <<'SQL'
\set runtime_role runtime_proof_password_log_success
\set runtime_password synthetic-lock-log-success-only
\set owner_id runtime-proof-password-owner
\i :installer_file
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>''
  OR current_setting('lock_timeout')<>'5s'
  OR current_setting('log_lock_waits')<>'on'
  OR current_setting('deadlock_timeout')<>'1s' THEN
  RAISE EXCEPTION 'PASSWORD_LOCK_LOG_SUCCESS_STATE_CHANGED';
 END IF;
END $$;
SQL
psql "${psql_args[@]}" >"$run_dir/password-lock-log-success-cleanup.log" 2>&1 <<'SQL'
DELETE FROM skillsheet_private.principals WHERE login_name='runtime_proof_password_log_success';
DROP OWNED BY runtime_proof_password_log_success;
DROP ROLE runtime_proof_password_log_success;
SQL
printf 'lock待機logの漏洩前に55P03・1ms設定の拒否・成功失敗時の設定維持: PASS\n'
# 空passwordは既存passwordを消さず、新規roleも作らず拒否する。
psql "${psql_args[@]}" -c "CREATE ROLE runtime_proof_empty_password LOGIN PASSWORD 'synthetic-empty-original-only'" >"$run_dir/empty-password-fixture.log" 2>&1
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/empty-password.before"
psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/empty-password-roles.before"
for empty_password_role in runtime_proof_empty_password runtime_proof_empty_password_new; do
  psql "${psql_args[@]}" -v VERBOSITY=verbose -v runtime_role="$empty_password_role" \
    -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
    >"$run_dir/$empty_password_role.log" 2>&1 <<'SQL'
\set ON_ERROR_STOP off
\set runtime_password ''
\set owner_id runtime-proof-empty-password-owner
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'EMPTY_PASSWORD_GUC_SURVIVED_FAILURE';
 END IF;
END $$;
SELECT 'EMPTY_PASSWORD_GUC_PASS';
SQL
  empty_password_error="$(rg -m1 'ERROR:' "$run_dir/$empty_password_role.log")"
  [[ "$empty_password_error" == *'ERROR:  22023:'*'INVALID_RUNTIME_PASSWORD'* ]]
  rg -q EMPTY_PASSWORD_GUC_PASS "$run_dir/$empty_password_role.log"
  psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/$empty_password_role.after"
  psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/$empty_password_role-roles.after"
  cmp "$run_dir/empty-password.before" "$run_dir/$empty_password_role.after"
  cmp "$run_dir/empty-password-roles.before" "$run_dir/$empty_password_role-roles.after"
done
for undefined_password_role in runtime_proof_empty_password runtime_proof_empty_password_new; do
  psql "${psql_args[@]}" -v VERBOSITY=verbose -v runtime_role="$undefined_password_role" \
    -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
    >"$run_dir/$undefined_password_role-undefined.log" 2>&1 <<'SQL'
\set ON_ERROR_STOP off
\unset runtime_password
\set owner_id runtime-proof-empty-password-owner
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'UNDEFINED_PASSWORD_GUC_SURVIVED_FAILURE';
 END IF;
END $$;
SELECT 'UNDEFINED_PASSWORD_GUC_PASS';
SQL
  undefined_password_error="$(rg -m1 'ERROR:' "$run_dir/$undefined_password_role-undefined.log")"
  [[ "$undefined_password_error" == *'ERROR:  22023:'*'INVALID_RUNTIME_PASSWORD'* ]]
  rg -q UNDEFINED_PASSWORD_GUC_PASS "$run_dir/$undefined_password_role-undefined.log"
  psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/$undefined_password_role-undefined.after"
  psql "${psql_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/$undefined_password_role-undefined-roles.after"
  cmp "$run_dir/empty-password.before" "$run_dir/$undefined_password_role-undefined.after"
  cmp "$run_dir/empty-password-roles.before" "$run_dir/$undefined_password_role-undefined-roles.after"
done
psql "${psql_args[@]}" -c 'DROP ROLE runtime_proof_empty_password' >"$run_dir/empty-password-cleanup.log" 2>&1
printf '既存・新規roleの空password拒否・元password含む全catalog維持・GUC消去: PASS\n'
psql "${psql_args[@]}" >"$run_dir/password-denial-cleanup.log" 2>&1 <<'SQL'
DROP OWNED BY runtime_proof_password_target,runtime_proof_password_admin,runtime_proof_foreign_password_manager;
DROP ROLE runtime_proof_password_target;
DROP ROLE runtime_proof_password_admin,runtime_proof_foreign_password_manager;
SQL
printf '他管理者runtime拒否・42501維持・password秘匿・GUC消去・全catalog一致: PASS\n'

# 特権属性・所有権・PUBLIC由来の権限は、安全に降格できたと推測しない。
psql "${psql_args[@]}" >"$run_dir/unsafe-runtime-fixtures.log" 2>&1 <<'SQL'
CREATE ROLE runtime_proof_bypass LOGIN BYPASSRLS;
CREATE ROLE runtime_proof_replication LOGIN REPLICATION;
CREATE ROLE runtime_proof_superuser LOGIN SUPERUSER;
CREATE ROLE runtime_proof_owner LOGIN;
CREATE TABLE public.runtime_proof_owned (id integer);
ALTER TABLE public.runtime_proof_owned OWNER TO runtime_proof_owner;
CREATE ROLE runtime_proof_expired LOGIN VALID UNTIL '2020-01-01';
CREATE ROLE runtime_proof_connection_blocked LOGIN CONNECTION LIMIT 0;
CREATE ROLE runtime_proof_public_definer LOGIN;
CREATE FUNCTION public.runtime_proof_definer() RETURNS bigint LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS 'SELECT count(*) FROM public.skill_sheets';
CREATE ROLE runtime_proof_public_view LOGIN;
CREATE ROLE runtime_proof_public_view_column LOGIN;
CREATE VIEW public.runtime_proof_leaky AS SELECT id, title FROM public.skill_sheets;
CREATE ROLE runtime_proof_membership LOGIN;
CREATE ROLE runtime_proof_grantor;
GRANT skillsheet_document_writer TO runtime_proof_grantor WITH ADMIN TRUE, INHERIT FALSE, SET TRUE;
SET ROLE runtime_proof_grantor;
GRANT skillsheet_document_writer TO runtime_proof_membership WITH INHERIT FALSE, SET TRUE;
RESET ROLE;
CREATE ROLE runtime_proof_public_column LOGIN;
CREATE ROLE runtime_proof_public_maintain LOGIN;
CREATE ROLE runtime_proof_public_acl LOGIN;
CREATE ROLE runtime_proof_database_create LOGIN;
CREATE ROLE runtime_proof_default_acl LOGIN;
CREATE ROLE runtime_proof_default_direct LOGIN;
CREATE ROLE runtime_proof_auth_maintain LOGIN;
CREATE ROLE runtime_proof_auth_truncate LOGIN;
CREATE ROLE runtime_proof_auth_references LOGIN;
CREATE ROLE runtime_proof_auth_trigger LOGIN;
CREATE ROLE runtime_proof_auth_column_reference LOGIN;
CREATE ROLE runtime_proof_public_sequence LOGIN;
CREATE ROLE runtime_proof_default_sequence LOGIN;
CREATE ROLE runtime_proof_default_function_global LOGIN;
CREATE ROLE runtime_proof_default_function_private LOGIN;
CREATE ROLE runtime_proof_default_function_public LOGIN;

CREATE SEQUENCE public.runtime_proof_sequence;
REVOKE ALL ON FUNCTION public.runtime_proof_definer() FROM PUBLIC;
SQL
for unsafe_role in runtime_proof_bypass runtime_proof_replication runtime_proof_superuser runtime_proof_owner runtime_proof_public_view runtime_proof_public_view_column runtime_proof_membership runtime_proof_expired runtime_proof_connection_blocked runtime_proof_public_definer runtime_proof_public_column runtime_proof_public_maintain runtime_proof_public_acl runtime_proof_database_create runtime_proof_default_acl runtime_proof_default_direct runtime_proof_auth_maintain runtime_proof_auth_truncate runtime_proof_auth_references runtime_proof_auth_trigger runtime_proof_auth_column_reference runtime_proof_public_sequence runtime_proof_default_sequence runtime_proof_default_function_global runtime_proof_default_function_private runtime_proof_default_function_public; do
  if [[ "$unsafe_role" == runtime_proof_public_maintain || "$unsafe_role" == runtime_proof_auth_maintain ]] && (( $(psql "${psql_args[@]}" -At -c "SHOW server_version_num") < 170000 )); then continue; fi
  if [[ "$unsafe_role" == runtime_proof_public_view ]]; then
    psql "${psql_args[@]}" -c 'GRANT SELECT ON public.runtime_proof_leaky TO PUBLIC' >"$run_dir/public-view-fixture.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_view_column ]]; then
    psql "${psql_args[@]}" -c 'GRANT SELECT(title) ON public.runtime_proof_leaky TO PUBLIC' >"$run_dir/public-view-column-fixture.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_definer ]]; then
    psql "${psql_args[@]}" -c 'GRANT EXECUTE ON FUNCTION public.runtime_proof_definer() TO PUBLIC' >"$run_dir/public-definer-fixture.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_column ]]; then
    psql "${psql_args[@]}" -c 'GRANT SELECT(title), UPDATE(title) ON public.skill_sheets TO PUBLIC' >"$run_dir/public-column-fixture.log" 2>&1
  fi
  # PG17のMAINTAINもPUBLIC経由でruntimeへ漏れる権限として独立検証する。
  if [[ "$unsafe_role" == runtime_proof_public_maintain ]]; then
    psql "${psql_args[@]}" -c 'GRANT MAINTAIN ON public.skill_sheets TO PUBLIC' >"$run_dir/public-maintain-fixture.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_acl ]]; then
    psql "${psql_args[@]}" -c 'GRANT SELECT ON public.skill_sheets TO PUBLIC' >"$run_dir/public-acl-fixture.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_database_create ]]; then
    psql "${psql_args[@]}" -c 'GRANT CREATE ON DATABASE postgres TO PUBLIC' >"$run_dir/database-create-fixture.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_default_acl ]]; then
    psql "${psql_args[@]}" -c 'ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC' >"$run_dir/default-acl-fixture.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_default_direct ]]; then
    psql "${psql_args[@]}" -c 'ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA public GRANT SELECT ON TABLES TO runtime_proof_default_direct' >"$run_dir/default-direct-fixture.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_auth_maintain ]]; then
    psql "${psql_args[@]}" -c 'GRANT MAINTAIN ON public."user" TO PUBLIC' >"$run_dir/auth-maintain-fixture.log" 2>&1
  fi
  case "$unsafe_role" in
    runtime_proof_auth_truncate|runtime_proof_auth_references|runtime_proof_auth_trigger)
      extra_privilege="${unsafe_role##runtime_proof_auth_}"
      psql "${psql_args[@]}" -c "GRANT $extra_privilege ON public.session TO PUBLIC" >"$run_dir/$unsafe_role-fixture.log" 2>&1 ;;
    runtime_proof_auth_column_reference)
      psql "${psql_args[@]}" -c 'GRANT REFERENCES(email) ON public."user" TO PUBLIC' >"$run_dir/$unsafe_role-fixture.log" 2>&1 ;;
    runtime_proof_public_sequence)
      psql "${psql_args[@]}" -c 'GRANT SELECT ON SEQUENCE public.runtime_proof_sequence TO PUBLIC' >"$run_dir/$unsafe_role-fixture.log" 2>&1 ;;
    runtime_proof_default_sequence)
      psql "${psql_args[@]}" -c 'ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA skillsheet_private GRANT USAGE ON SEQUENCES TO PUBLIC' >"$run_dir/$unsafe_role-fixture.log" 2>&1 ;;
  esac
  case "$unsafe_role" in
    runtime_proof_default_function_global)
      psql "${psql_args[@]}" -c "ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer GRANT EXECUTE ON FUNCTIONS TO $unsafe_role" >"$run_dir/$unsafe_role-fixture.log" 2>&1 ;;
    runtime_proof_default_function_private)
      psql "${psql_args[@]}" -c "ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA skillsheet_private GRANT EXECUTE ON FUNCTIONS TO $unsafe_role" >"$run_dir/$unsafe_role-fixture.log" 2>&1 ;;
    runtime_proof_default_function_public)
      psql "${psql_args[@]}" -c "ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO $unsafe_role" >"$run_dir/$unsafe_role-fixture.log" 2>&1 ;;
  esac
  psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/$unsafe_role.before"
  if psql "${psql_args[@]}" -v runtime_role="$unsafe_role" -v runtime_password=synthetic-verification-only \
    -v owner_id=runtime-proof-unsafe -f "$repo_dir/script/sql/install-runtime-role.sql" >"$run_dir/$unsafe_role.log" 2>&1; then
    printf '不正runtimeへのinstallが成功しました: %s\n' "$unsafe_role" >&2
    exit 1
  fi
  case "$unsafe_role" in
    runtime_proof_owner) expected_error=UNSAFE_RUNTIME_OWNERSHIP ;;
    runtime_proof_public_view|runtime_proof_public_view_column|runtime_proof_membership|runtime_proof_public_definer|runtime_proof_public_column|runtime_proof_public_maintain|runtime_proof_public_acl|runtime_proof_database_create|runtime_proof_default_acl|runtime_proof_default_direct|runtime_proof_auth_maintain|runtime_proof_auth_truncate|runtime_proof_auth_references|runtime_proof_auth_trigger|runtime_proof_auth_column_reference|runtime_proof_public_sequence|runtime_proof_default_sequence|runtime_proof_default_function_global|runtime_proof_default_function_private|runtime_proof_default_function_public) expected_error=RUNTIME_BOUNDARY_PERMISSION_LEAK ;;
    *) expected_error=UNSAFE_RUNTIME_ROLE ;;
  esac
  rg -q "$expected_error" "$run_dir/$unsafe_role.log"
  psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/$unsafe_role.after"
  cmp "$run_dir/$unsafe_role.before" "$run_dir/$unsafe_role.after"
  if [[ "$unsafe_role" == runtime_proof_public_view ]]; then
    psql "${psql_args[@]}" -c 'REVOKE SELECT ON public.runtime_proof_leaky FROM PUBLIC' >"$run_dir/public-view-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_view_column ]]; then
    psql "${psql_args[@]}" -c 'REVOKE SELECT(title) ON public.runtime_proof_leaky FROM PUBLIC' >"$run_dir/public-view-column-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_definer ]]; then
    psql "${psql_args[@]}" -c 'REVOKE EXECUTE ON FUNCTION public.runtime_proof_definer() FROM PUBLIC' >"$run_dir/public-definer-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_column ]]; then
    psql "${psql_args[@]}" -c 'REVOKE SELECT(title), UPDATE(title) ON public.skill_sheets FROM PUBLIC' >"$run_dir/public-column-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_maintain ]]; then
    psql "${psql_args[@]}" -c 'REVOKE MAINTAIN ON public.skill_sheets FROM PUBLIC' >"$run_dir/public-maintain-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_public_acl ]]; then
    psql "${psql_args[@]}" -c 'REVOKE SELECT ON public.skill_sheets FROM PUBLIC' >"$run_dir/public-acl-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_database_create ]]; then
    psql "${psql_args[@]}" -c 'REVOKE CREATE ON DATABASE postgres FROM PUBLIC' >"$run_dir/database-create-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_default_acl ]]; then
    psql "${psql_args[@]}" -c 'ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA public REVOKE SELECT ON TABLES FROM PUBLIC' >"$run_dir/default-acl-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_default_direct ]]; then
    psql "${psql_args[@]}" -c 'ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA public REVOKE SELECT ON TABLES FROM runtime_proof_default_direct' >"$run_dir/default-direct-cleanup.log" 2>&1
  fi
  if [[ "$unsafe_role" == runtime_proof_auth_maintain ]]; then
    psql "${psql_args[@]}" -c 'REVOKE MAINTAIN ON public."user" FROM PUBLIC' >"$run_dir/auth-maintain-cleanup.log" 2>&1
  fi
  case "$unsafe_role" in
    runtime_proof_auth_truncate|runtime_proof_auth_references|runtime_proof_auth_trigger)
      psql "${psql_args[@]}" -c "REVOKE $extra_privilege ON public.session FROM PUBLIC" >"$run_dir/$unsafe_role-cleanup.log" 2>&1 ;;
    runtime_proof_auth_column_reference)
      psql "${psql_args[@]}" -c 'REVOKE REFERENCES(email) ON public."user" FROM PUBLIC' >"$run_dir/$unsafe_role-cleanup.log" 2>&1 ;;
    runtime_proof_public_sequence)
      psql "${psql_args[@]}" -c 'REVOKE SELECT ON SEQUENCE public.runtime_proof_sequence FROM PUBLIC' >"$run_dir/$unsafe_role-cleanup.log" 2>&1 ;;
    runtime_proof_default_sequence)
      psql "${psql_args[@]}" -c 'ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA skillsheet_private REVOKE USAGE ON SEQUENCES FROM PUBLIC' >"$run_dir/$unsafe_role-cleanup.log" 2>&1 ;;
  esac
  case "$unsafe_role" in
    runtime_proof_default_function_global)
      psql "${psql_args[@]}" -c "ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer REVOKE EXECUTE ON FUNCTIONS FROM $unsafe_role" >"$run_dir/$unsafe_role-cleanup.log" 2>&1 ;;
    runtime_proof_default_function_private)
      psql "${psql_args[@]}" -c "ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA skillsheet_private REVOKE EXECUTE ON FUNCTIONS FROM $unsafe_role" >"$run_dir/$unsafe_role-cleanup.log" 2>&1 ;;
    runtime_proof_default_function_public)
      psql "${psql_args[@]}" -c "ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM $unsafe_role" >"$run_dir/$unsafe_role-cleanup.log" 2>&1 ;;
  esac
done
psql "${psql_args[@]}" -c '
SET ROLE runtime_proof_grantor;
REVOKE skillsheet_document_writer FROM runtime_proof_membership;
RESET ROLE;
DROP VIEW public.runtime_proof_leaky;
DROP SEQUENCE public.runtime_proof_sequence;
DROP FUNCTION public.runtime_proof_definer();
DROP TABLE public.runtime_proof_owned;
DROP ROLE runtime_proof_bypass, runtime_proof_replication, runtime_proof_superuser, runtime_proof_owner, runtime_proof_public_view, runtime_proof_public_view_column, runtime_proof_membership, runtime_proof_grantor, runtime_proof_expired, runtime_proof_connection_blocked, runtime_proof_public_definer, runtime_proof_public_column, runtime_proof_public_maintain, runtime_proof_public_acl, runtime_proof_database_create, runtime_proof_default_acl, runtime_proof_default_direct, runtime_proof_auth_maintain, runtime_proof_auth_truncate, runtime_proof_auth_references, runtime_proof_auth_trigger, runtime_proof_auth_column_reference, runtime_proof_public_sequence, runtime_proof_default_sequence, runtime_proof_default_function_global, runtime_proof_default_function_private, runtime_proof_default_function_public;
' >"$run_dir/unsafe-runtime-cleanup.log" 2>&1
printf '特権・所有権・PUBLIC権限の拒否と失敗時rollback: PASS\n'
# 危険なdefault EXECUTEを全て除去した後、別roleへの合法な関数defaultは阻害しない。
psql "${psql_args[@]}" >"$run_dir/function-default-legitimate-fixture.log" 2>&1 <<'SQL'
CREATE ROLE runtime_proof_default_legitimate NOLOGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer
 GRANT EXECUTE ON FUNCTIONS TO runtime_proof_default_legitimate;
SQL
psql "${psql_args[@]}" -v runtime_role=runtime_proof_function_positive \
  -v runtime_password=synthetic-function-positive-only -v owner_id=runtime-proof-function-positive \
  -f "$repo_dir/script/sql/install-runtime-role.sql" >"$run_dir/function-default-clean-positive.log" 2>&1
psql "${psql_args[@]}" -U runtime_proof_function_positive >"$run_dir/function-default-positive-login.log" 2>&1 <<'SQL'
DO $$ BEGIN
 IF skillsheet_private.read_snapshot(NULL,'runtime-proof-function-positive')->>'status' IS DISTINCT FROM 'EMPTY'
  OR skillsheet_private.list_sheets('runtime-proof-function-positive') IS DISTINCT FROM '[]'::jsonb THEN
  RAISE EXCEPTION 'Clean installer positive LOGIN failed after unsafe defaults removed';
 END IF;
END $$;
SQL
psql "${psql_args[@]}" >"$run_dir/function-default-positive-cleanup.log" 2>&1 <<'SQL'
DELETE FROM skillsheet_private.principals WHERE login_name='runtime_proof_function_positive';
ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer
 REVOKE EXECUTE ON FUNCTIONS FROM runtime_proof_default_legitimate;
DROP OWNED BY runtime_proof_function_positive,runtime_proof_default_legitimate;
DROP ROLE runtime_proof_function_positive,runtime_proof_default_legitimate;
SQL
printf '関数default EXECUTEの3範囲を拒否・合法な別granteeと除去後の正常LOGIN: PASS\n'

# 2接続目が実際にロック待ちになったことを観測し、直列実行を競合試験と誤認しない。
psql "${psql_args[@]}" -f "$repo_dir/script/sql/seed-document-cas-proof.sql" >"$run_dir/cas-seed.log" 2>&1
cas_args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55440 -U cas_runtime -d postgres)
psql "${psql_args[@]}" -f "$repo_dir/script/sql/seed-period-repair-proof.sql" >"$run_dir/repair-seed.log" 2>&1
(cd "$repo_dir" && pnpm exec tsx script/verify-repair-db.ts "$run_dir") >"$run_dir/repair-dry-run.log" 2>&1
printf '修復案dry-run実DB検証: PASS\n'
observe_wait() {
  local application="$1" event_type="$2" seen=false
  for ((attempt=0; attempt<100; attempt++)); do
    if [[ "$(psql "${psql_args[@]}" -At -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='$application' AND wait_event_type='$event_type'")" == 1 ]]; then
      seen=true; break
    fi
    sleep 0.02
  done
  [[ "$seen" == true ]]
}
psql "${cas_args[@]}" -f "$repo_dir/script/sql/test-document-cas-first.sql" >"$run_dir/cas-first.log" 2>&1 &
first_pid=$!
observe_wait cas-first Timeout
psql "${cas_args[@]}" -f "$repo_dir/script/sql/test-document-cas-second.sql" >"$run_dir/cas-second.log" 2>&1 &
second_pid=$!
observe_wait cas-second Lock
wait "$first_pid"
wait "$second_pid"
printf '2接続CAS・実ロック待機・競合拒否: PASS\n'

# 削除がowner lockを保持している間に古いcreateを再送する。
psql "${cas_args[@]}" -f "$repo_dir/script/sql/test-document-delete-first.sql" >"$run_dir/delete-first.log" 2>&1 &
first_pid=$!
observe_wait delete-first Timeout
psql "${cas_args[@]}" -f "$repo_dir/script/sql/test-document-create-after-delete.sql" >"$run_dir/create-after-delete.log" 2>&1 &
second_pid=$!
observe_wait create-after-delete Lock
wait "$first_pid"
wait "$second_pid"
printf '削除中create再送・実ロック待機・復活拒否: PASS\n'

# role・所有権・関数ACLも含むcluster backupを、別の新規clusterへ復元する。
psql "${psql_args[@]}" -f "$repo_dir/script/sql/seed-document-restore-proof.sql" >"$run_dir/restore-fixture.log" 2>&1
psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-document-restore-proof.sql" >"$run_dir/before.json"
pg_dumpall -h "$run_dir" -p 55440 -U boundary_admin >"$run_dir/cluster.sql"
initdb -D "$run_dir/restored" -U restore_admin --auth=trust --no-locale -E UTF8 >"$run_dir/restore-init.log" 2>&1
pg_ctl -D "$run_dir/restored" -l "$run_dir/restore-server.log" -o "-c listen_addresses='' -k '$run_dir' -p 55441" -w start >/dev/null
restore_args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55441 -U restore_admin -d postgres)
psql "${restore_args[@]}" -f "$run_dir/cluster.sql" >"$run_dir/restore.log" 2>&1
psql "${restore_args[@]}" -At -f "$repo_dir/script/sql/read-document-restore-proof.sql" >"$run_dir/after.json"
cmp "$run_dir/before.json" "$run_dir/after.json"
for stage in test-skillsheet-read-boundary test-skillsheet-write-boundary; do
  psql "${restore_args[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/restored-$stage.log" 2>&1
done
psql -X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55441 -U cas_runtime -d postgres \
  -f "$repo_dir/script/sql/test-document-create-after-delete.sql" >"$run_dir/restored-create-after-delete.log" 2>&1
printf '別cluster復旧・文書3表一致・復旧後権限試験: PASS\n'

# 境界owner roleはcluster共通なので、既存seedから独立した新clusterで履歴を検証する。
initdb -D "$run_dir/history-data" -U history_admin --auth=trust --no-locale -E UTF8 >"$run_dir/history-init.log" 2>&1
pg_ctl -D "$run_dir/history-data" -l "$run_dir/history-server.log" -o "-c listen_addresses='' -k '$run_dir' -p 55442" -w start >/dev/null
history_args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55442 -U history_admin -d postgres)
for migration in "$repo_dir"/drizzle/migration/*.sql; do
  psql "${history_args[@]}" -f "$migration" >>"$run_dir/history-migrations.log" 2>&1
done
for stage in install-skillsheet-read-boundary install-skillsheet-write-boundary install-document-history; do
  psql "${history_args[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/history-$stage.log" 2>&1
done
psql "${history_args[@]}" -f "$repo_dir/script/sql/test-runtime-history-provisioning.sql" >"$run_dir/runtime-history-provisioning.log" 2>&1
printf '現行履歴の初回・再実行・限定権限・CAS・削除復元: PASS\n'

# 実pg_stat_statementsを別clusterへ読み込み、SQL本文と低権限LOGINからの観測を検証する。
initdb -D "$run_dir/pgstat-data" -U boundary_admin --auth=trust --no-locale -E UTF8 >"$run_dir/pgstat-init.log" 2>&1
pg_ctl -D "$run_dir/pgstat-data" -l "$run_dir/pgstat-server.log" \
  -o "-c listen_addresses='' -c shared_preload_libraries=pg_stat_statements -k '$run_dir' -p 55444" -w start >/dev/null
# 合成runtimeのLOGINはSCRAMで実passwordを検証し、trust接続をcredential証明と誤認しない。
{
  printf 'local all runtime_proof_telemetry_runtime,runtime_proof_telemetry_special scram-sha-256\n'
  cat "$run_dir/pgstat-data/pg_hba.conf"
} >"$run_dir/pgstat-hba.new"
mv "$run_dir/pgstat-hba.new" "$run_dir/pgstat-data/pg_hba.conf"
pg_ctl -D "$run_dir/pgstat-data" reload >"$run_dir/pgstat-reload.log" 2>&1
pgstat_args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55444 -U boundary_admin -d postgres)
for migration in "$repo_dir"/drizzle/migration/*.sql; do
  psql "${pgstat_args[@]}" -f "$migration" >>"$run_dir/pgstat-migrations.log" 2>&1
done
for stage in install-skillsheet-read-boundary install-skillsheet-write-boundary; do
  psql "${pgstat_args[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/pgstat-$stage.log" 2>&1
done
psql "${pgstat_args[@]}" >"$run_dir/pgstat-fixture.log" 2>&1 <<'SQL'
CREATE SCHEMA metrics;
CREATE EXTENSION pg_stat_statements WITH SCHEMA metrics;
CREATE ROLE runtime_proof_stats_actor LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT pg_read_all_stats TO runtime_proof_stats_actor;
GRANT USAGE ON SCHEMA metrics TO runtime_proof_stats_actor;
GRANT SELECT ON ALL TABLES IN SCHEMA metrics TO runtime_proof_stats_actor;
DO $$ BEGIN
 IF current_setting('pg_stat_statements.track')<>'top'
  OR current_setting('pg_stat_statements.track_utility')<>'on' THEN
  RAISE EXCEPTION 'Expected actual pg_stat_statements default tracking';
 END IF;
END $$;
SQL
psql "${pgstat_args[@]}" -U runtime_proof_stats_actor >"$run_dir/pgstat-actor.log" 2>&1 <<'SQL'
DO $$ BEGIN
 IF SESSION_USER<>'runtime_proof_stats_actor'
  OR EXISTS(SELECT FROM pg_roles WHERE rolname=SESSION_USER AND (rolsuper OR rolcreatedb OR rolcreaterole))
  OR EXISTS(SELECT FROM pg_auth_members WHERE member=SESSION_USER::regrole AND admin_option) THEN
  RAISE EXCEPTION 'Stats observer is not an actual LOGIN without ADMIN';
 END IF;
END $$;
SQL
# 同じ統計を保持して初回・再実行を観測する。途中でpg_stat_statements_resetは呼ばない。
for pgstat_pass in initial reinstall; do
  psql "${pgstat_args[@]}" -v runtime_role=runtime_proof_telemetry_runtime \
    -v runtime_password=synthetic-pgstat-top-proof-marker -v owner_id=runtime-proof-telemetry-owner \
    -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
    >"$run_dir/pgstat-$pgstat_pass.log" 2>&1 <<'SQL'
\i :installer_file
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'PGSTAT_PASSWORD_GUC_SURVIVED_SUCCESS';
 END IF;
END $$;
SQL
  for pgstat_observer in boundary_admin runtime_proof_stats_actor; do
    [[ "$(psql "${pgstat_args[@]}" -U "$pgstat_observer" -At -c "SELECT count(*) FROM metrics.pg_stat_statements WHERE query LIKE '%synthetic-pgstat-top-proof-marker%'")" == 0 ]]
  done
done
[[ "$(psql "${pgstat_args[@]}" -At -c 'SELECT count(*)>0 FROM metrics.pg_stat_statements')" == t ]]
PGPASSWORD=synthetic-pgstat-top-proof-marker psql "${pgstat_args[@]}" -U runtime_proof_telemetry_runtime \
  >"$run_dir/pgstat-runtime-authenticated-login.log" 2>&1 <<'SQL'
DO $$ BEGIN
 IF SESSION_USER<>'runtime_proof_telemetry_runtime'
  OR skillsheet_private.read_snapshot(NULL,'runtime-proof-telemetry-owner')->>'status' IS DISTINCT FROM 'EMPTY' THEN
  RAISE EXCEPTION 'Actual password-authenticated runtime LOGIN failed';
 END IF;
END $$;
SQL

# \\bindと同じ経路でquote・backslash・空白・Unicode・改行をそのまま保持する。
psql "${pgstat_args[@]}" >"$run_dir/pgstat-bind-fidelity.log" 2>&1 <<'SQL'
\set runtime_password 'synthetic quote\' slash\\ space 日本語\nnewline'
BEGIN;
SELECT set_config('vars.runtime_password',$1,true) IS NOT NULL
\bind :runtime_password
\g
DO $$ BEGIN
 IF current_setting('vars.runtime_password') IS DISTINCT FROM
  U&'synthetic quote'' slash\\ space \65E5\672C\8A9E\000Anewline' THEN
  RAISE EXCEPTION 'BOUND_PASSWORD_CHARACTER_FIDELITY_FAILED';
 END IF;
END $$;
ROLLBACK;
SQL
# 実installerが特殊文字のpasswordを設定したroleにも、同じ値でSCRAM接続する。
psql "${pgstat_args[@]}" -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
  >"$run_dir/pgstat-special-password-install.log" 2>&1 <<'SQL'
\set runtime_role runtime_proof_telemetry_special
\set runtime_password 'synthetic quote\' slash\\ space 日本語\nnewline'
\set owner_id runtime-proof-telemetry-special-owner
\i :installer_file
SQL
pgstat_special_password=$'synthetic quote\' slash\\ space 日本語\nnewline'
PGPASSWORD="$pgstat_special_password" psql "${pgstat_args[@]}" -U runtime_proof_telemetry_special \
  >"$run_dir/pgstat-special-authenticated-login.log" 2>&1 <<'SQL'
DO $$ BEGIN
 IF SESSION_USER<>'runtime_proof_telemetry_special'
  OR skillsheet_private.read_snapshot(NULL,'runtime-proof-telemetry-special-owner')->>'status' IS DISTINCT FROM 'EMPTY' THEN
  RAISE EXCEPTION 'Special-character password-authenticated LOGIN failed';
 END IF;
END $$;
SQL
unset pgstat_special_password
psql "${pgstat_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/pgstat-denial.before"
psql "${pgstat_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/pgstat-denial-roles.before"
for telemetry_case in track-all-existing track-all-new log-all-existing log-all-new; do
  telemetry_target=runtime_proof_telemetry_runtime
  if [[ "$telemetry_case" == *-new ]]; then telemetry_target=runtime_proof_telemetry_new; fi
  telemetry_setting="SET pg_stat_statements.track='all'"
  if [[ "$telemetry_case" == log-* ]]; then telemetry_setting="SET log_statement='all'"; fi
  psql "${pgstat_args[@]}" -v VERBOSITY=verbose -v runtime_role="$telemetry_target" \
    -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
    -c "$telemetry_setting" -f - >"$run_dir/pgstat-$telemetry_case.log" 2>&1 <<'SQL'
\set ON_ERROR_STOP off
\set runtime_password synthetic-pgstat-denied-proof-marker
\set owner_id runtime-proof-telemetry-owner
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'TELEMETRY_PASSWORD_GUC_SURVIVED_FAILURE';
 END IF;
END $$;
SELECT 'TELEMETRY_PASSWORD_GUC_PASS';
SQL
  telemetry_first_error="$(rg -m1 'ERROR:' "$run_dir/pgstat-$telemetry_case.log")"
  [[ "$telemetry_first_error" == *'ERROR:  42501:'*'UNSAFE_RUNTIME_PASSWORD_TELEMETRY'* ]]
  rg -q TELEMETRY_PASSWORD_GUC_PASS "$run_dir/pgstat-$telemetry_case.log"
  if rg -q 'synthetic-pgstat-denied-proof-marker' "$run_dir/pgstat-$telemetry_case.log" "$run_dir/pgstat-server.log"; then
    printf '拒否したtelemetry設定で合成passwordがログへ露出しました\n' >&2
    exit 1
  fi
  for pgstat_observer in boundary_admin runtime_proof_stats_actor; do
    [[ "$(psql "${pgstat_args[@]}" -U "$pgstat_observer" -At -c "SELECT count(*) FROM metrics.pg_stat_statements WHERE query LIKE '%synthetic-pgstat-denied-proof-marker%'")" == 0 ]]
  done
  psql "${pgstat_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/pgstat-$telemetry_case.after"
  psql "${pgstat_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/pgstat-$telemetry_case-roles.after"
  cmp "$run_dir/pgstat-denial.before" "$run_dir/pgstat-$telemetry_case.after"
  cmp "$run_dir/pgstat-denial-roles.before" "$run_dir/pgstat-$telemetry_case-roles.after"
done
# 前回trueが残っていても、事前SQLが失敗したON_ERROR_STOP off接続ではbindを実行しない。
psql "${pgstat_args[@]}" -v VERBOSITY=verbose -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
  >"$run_dir/pgstat-stale-preflight.log" 2>&1 <<'SQL'
\set ON_ERROR_STOP off
\set runtime_role runtime_proof_telemetry_runtime
\set runtime_password synthetic-stale-preflight-proof-marker
\set owner_id runtime-proof-telemetry-owner
\set runtime_password_input_allowed true
BEGIN;
SELECT 1/0;
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
SELECT :'runtime_password_input_allowed'::boolean IS FALSE AS stale_preflight_reset
\gset
\if :stale_preflight_reset
\else
DO $$ BEGIN RAISE EXCEPTION 'STALE_PREFLIGHT_TRUE_SURVIVED'; END $$;
\endif
DO $$ BEGIN
 IF coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'STALE_PREFLIGHT_PASSWORD_GUC_SURVIVED';
 END IF;
END $$;
SELECT 'STALE_PREFLIGHT_FAIL_CLOSED_PASS';
SQL
rg -q 'ERROR:  22012:' "$run_dir/pgstat-stale-preflight.log"
rg -q 'ERROR:  25P02:' "$run_dir/pgstat-stale-preflight.log"
rg -q STALE_PREFLIGHT_FAIL_CLOSED_PASS "$run_dir/pgstat-stale-preflight.log"
if rg -q 'synthetic-stale-preflight-proof-marker' "$run_dir/pgstat-stale-preflight.log" "$run_dir/pgstat-server.log"; then
  printf '失敗したpreflightで合成passwordがログへ露出しました\n' >&2
  exit 1
fi
for pgstat_observer in boundary_admin runtime_proof_stats_actor; do
  [[ "$(psql "${pgstat_args[@]}" -U "$pgstat_observer" -At -c "SELECT count(*) FROM metrics.pg_stat_statements WHERE query LIKE '%synthetic-stale-preflight-proof-marker%'")" == 0 ]]
done
psql "${pgstat_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/pgstat-stale-preflight.after"
psql "${pgstat_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/pgstat-stale-preflight-roles.after"
cmp "$run_dir/pgstat-denial.before" "$run_dir/pgstat-stale-preflight.after"
cmp "$run_dir/pgstat-denial-roles.before" "$run_dir/pgstat-stale-preflight-roles.after"
# 再利用sessionの旧role/ownerを、未定義psql変数によるSET失敗の後に更新対象へ使わない。
for missing_principal_case in role owner both; do
  missing_runtime_role=false
  missing_owner_id=false
  if [[ "$missing_principal_case" == role || "$missing_principal_case" == both ]]; then missing_runtime_role=true; fi
  if [[ "$missing_principal_case" == owner || "$missing_principal_case" == both ]]; then missing_owner_id=true; fi
  psql "${pgstat_args[@]}" -v VERBOSITY=verbose -v installer_file="$repo_dir/script/sql/install-runtime-role.sql" \
    -v missing_runtime_role="$missing_runtime_role" -v missing_owner_id="$missing_owner_id" \
    >"$run_dir/pgstat-missing-$missing_principal_case.log" 2>&1 <<'SQL'
SET vars.runtime_role='runtime_proof_telemetry_runtime';
SET vars.owner_id='runtime-proof-telemetry-owner';
\set runtime_role runtime_proof_telemetry_runtime
\set owner_id runtime-proof-telemetry-owner
\set runtime_password synthetic-missing-principal-proof-marker
\if :missing_runtime_role
\unset runtime_role
\endif
\if :missing_owner_id
\unset owner_id
\endif
\set ON_ERROR_STOP off
\i :installer_file
ROLLBACK;
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_setting('vars.runtime_role')<>'runtime_proof_telemetry_runtime'
  OR current_setting('vars.owner_id')<>'runtime-proof-telemetry-owner'
  OR coalesce(current_setting('vars.runtime_password',true),'')<>'' THEN
  RAISE EXCEPTION 'MISSING_PRINCIPAL_SESSION_STATE_CHANGED';
 END IF;
END $$;
SELECT 'MISSING_PRINCIPAL_FAIL_ATOMIC_PASS';
SQL
  missing_principal_first_error="$(rg -m1 'ERROR:' "$run_dir/pgstat-missing-$missing_principal_case.log")"
  [[ "$missing_principal_first_error" == *'ERROR:  42601:'* ]]
  rg -q 'ERROR:  25P02:' "$run_dir/pgstat-missing-$missing_principal_case.log"
  rg -q MISSING_PRINCIPAL_FAIL_ATOMIC_PASS "$run_dir/pgstat-missing-$missing_principal_case.log"
  if rg -q 'synthetic-missing-principal-proof-marker' "$run_dir/pgstat-missing-$missing_principal_case.log" "$run_dir/pgstat-server.log"; then
    printf '未定義role/ownerの拒否で合成passwordがログへ露出しました\n' >&2
    exit 1
  fi
  for pgstat_observer in boundary_admin runtime_proof_stats_actor; do
    [[ "$(psql "${pgstat_args[@]}" -U "$pgstat_observer" -At -c "SELECT count(*) FROM metrics.pg_stat_statements WHERE query LIKE '%synthetic-missing-principal-proof-marker%'")" == 0 ]]
  done
  psql "${pgstat_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/pgstat-missing-$missing_principal_case.after"
  psql "${pgstat_args[@]}" -At -c 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY rolname)::text) FROM pg_authid r' >"$run_dir/pgstat-missing-$missing_principal_case-roles.after"
  cmp "$run_dir/pgstat-denial.before" "$run_dir/pgstat-missing-$missing_principal_case.after"
  cmp "$run_dir/pgstat-denial-roles.before" "$run_dir/pgstat-missing-$missing_principal_case-roles.after"
done
printf '再利用sessionでrole・owner未定義の拒否・旧password含む全catalog維持: PASS\n'
printf '実SQL統計の初回・再実行でpassword記録なし・特殊文字bind・危険telemetry拒否: PASS\n'

cleanup
trap - EXIT
printf '検証ログと停止済み合成DB: %s\n' "$run_dir"
