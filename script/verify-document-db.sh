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
for binary in initdb pg_ctl psql pg_dumpall; do command -v "$binary" >/dev/null; done
cleanup() {
  local cleanup_result=0
  for cluster in data restored; do
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

cleanup
trap - EXIT
printf '検証ログと停止済み合成DB: %s\n' "$run_dir"
