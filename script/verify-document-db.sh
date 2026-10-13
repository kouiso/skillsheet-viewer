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
  for cluster in data restored history-data; do
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
CREATE SEQUENCE public.runtime_proof_sequence;
REVOKE ALL ON FUNCTION public.runtime_proof_definer() FROM PUBLIC;
SQL
for unsafe_role in runtime_proof_bypass runtime_proof_replication runtime_proof_superuser runtime_proof_owner runtime_proof_public_view runtime_proof_public_view_column runtime_proof_membership runtime_proof_expired runtime_proof_connection_blocked runtime_proof_public_definer runtime_proof_public_column runtime_proof_public_maintain runtime_proof_public_acl runtime_proof_database_create runtime_proof_default_acl runtime_proof_default_direct runtime_proof_auth_maintain runtime_proof_auth_truncate runtime_proof_auth_references runtime_proof_auth_trigger runtime_proof_auth_column_reference runtime_proof_public_sequence runtime_proof_default_sequence; do
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
  psql "${psql_args[@]}" -At -f "$repo_dir/script/sql/read-runtime-provisioning-proof.sql" >"$run_dir/$unsafe_role.before"
  if psql "${psql_args[@]}" -v runtime_role="$unsafe_role" -v runtime_password=synthetic-verification-only \
    -v owner_id=runtime-proof-unsafe -f "$repo_dir/script/sql/install-runtime-role.sql" >"$run_dir/$unsafe_role.log" 2>&1; then
    printf '不正runtimeへのinstallが成功しました: %s\n' "$unsafe_role" >&2
    exit 1
  fi
  case "$unsafe_role" in
    runtime_proof_owner) expected_error=UNSAFE_RUNTIME_OWNERSHIP ;;
    runtime_proof_public_view|runtime_proof_public_view_column|runtime_proof_membership|runtime_proof_public_definer|runtime_proof_public_column|runtime_proof_public_maintain|runtime_proof_public_acl|runtime_proof_database_create|runtime_proof_default_acl|runtime_proof_default_direct|runtime_proof_auth_maintain|runtime_proof_auth_truncate|runtime_proof_auth_references|runtime_proof_auth_trigger|runtime_proof_auth_column_reference|runtime_proof_public_sequence|runtime_proof_default_sequence) expected_error=RUNTIME_BOUNDARY_PERMISSION_LEAK ;;
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
done
psql "${psql_args[@]}" -c '
SET ROLE runtime_proof_grantor;
REVOKE skillsheet_document_writer FROM runtime_proof_membership;
RESET ROLE;
DROP VIEW public.runtime_proof_leaky;
DROP SEQUENCE public.runtime_proof_sequence;
DROP FUNCTION public.runtime_proof_definer();
DROP TABLE public.runtime_proof_owned;
DROP ROLE runtime_proof_bypass, runtime_proof_replication, runtime_proof_superuser, runtime_proof_owner, runtime_proof_public_view, runtime_proof_public_view_column, runtime_proof_membership, runtime_proof_grantor, runtime_proof_expired, runtime_proof_connection_blocked, runtime_proof_public_definer, runtime_proof_public_column, runtime_proof_public_maintain, runtime_proof_public_acl, runtime_proof_database_create, runtime_proof_default_acl, runtime_proof_default_direct, runtime_proof_auth_maintain, runtime_proof_auth_truncate, runtime_proof_auth_references, runtime_proof_auth_trigger, runtime_proof_auth_column_reference, runtime_proof_public_sequence, runtime_proof_default_sequence;
' >"$run_dir/unsafe-runtime-cleanup.log" 2>&1
printf '特権・所有権・PUBLIC権限の拒否と失敗時rollback: PASS\n'

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

cleanup
trap - EXIT
printf '検証ログと停止済み合成DB: %s\n' "$run_dir"
