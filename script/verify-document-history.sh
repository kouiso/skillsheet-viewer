#!/usr/bin/env bash
# 新規ローカルclusterだけに接続する。秘密値・既存DATABASE_URLを使用しない。
set -euo pipefail
umask 077
pg_major="$(initdb --version | sed -E 's/.* ([0-9]+)\..*/\1/')"
if (( pg_major < 16 )); then printf 'PostgreSQL 16以上のbinをPATHへ指定してください。\n' >&2; exit 1; fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
run_dir="$(mktemp -d /tmp/skillsheet-history.XXXXXX)"
for pg_variable in ${!PG@}; do unset "$pg_variable"; done
unset DATABASE_URL
cleanup() { if [[ -f "$run_dir/data/postmaster.pid" ]]; then pg_ctl -D "$run_dir/data" -m fast -w stop >>"$run_dir/server.log" 2>&1; fi; }
trap cleanup EXIT
initdb -D "$run_dir/data" -U history_admin --auth=trust --no-locale -E UTF8 >"$run_dir/init.log" 2>&1
pg_ctl -D "$run_dir/data" -l "$run_dir/server.log" -o "-c listen_addresses='' -k '$run_dir' -p 55449" -w start >/dev/null
args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55449 -U history_admin -d postgres)
printf '私用証跡: %s\n' "$run_dir"
for migration in "$repo_dir"/drizzle/migration/*.sql; do psql "${args[@]}" -f "$migration" >>"$run_dir/migration.log" 2>&1; done
for stage in install-skillsheet-read-boundary install-skillsheet-write-boundary install-document-history test-skillsheet-read-boundary test-skillsheet-write-boundary test-document-history; do
 psql "${args[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/$stage.log" 2>&1
 printf '%s: PASS\n' "$stage"
done

# 実際の待機イベントを観測してから次の接続を開始する。逐次実行を競合試験とみなさない。
observe_wait() {
 local app="$1" event="$2"
 for ((i=0;i<100;i++)); do
  if [[ "$(psql "${args[@]}" -At -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='$app' AND wait_event_type='$event'")" == 1 ]]; then return 0; fi
  sleep 0.02
 done
 return 1
}
runtime_args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55449 -U history_runtime -d postgres)
psql "${runtime_args[@]}" -f "$repo_dir/script/sql/test-history-cas-first.sql" >"$run_dir/cas-first.log" 2>&1 &
first_pid=$!
observe_wait history-cas-first Timeout
psql "${runtime_args[@]}" -f "$repo_dir/script/sql/test-history-cas-second.sql" >"$run_dir/cas-second.log" 2>&1 &
second_pid=$!
observe_wait history-cas-second Lock
wait "$first_pid"
wait "$second_pid"
printf '2接続restore実ロック待機・CAS競合拒否: PASS\n'
