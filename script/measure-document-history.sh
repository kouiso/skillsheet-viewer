#!/usr/bin/env bash
# 版履歴の容量と保存負荷を、新規ローカルclusterの合成データだけで計測する（#574）。
# 本番・共有DB・DATABASE_URL には接続しない。結果は Neon 本番の実測ではなく、合成環境での計測値として扱う。
#
# 使い方: ./script/measure-document-history.sh
#   サンプル数は環境変数で変えられる（既定は 1 日 200 保存の重い日と、15 保存の通常日。同じシートの 2 writer 競合も通常日の保存数で測る）。
#   HISTORY_MEASURE_BURST_SAVES / HISTORY_MEASURE_NORMAL_SAVES / HISTORY_MEASURE_SMALL_BYTES / HISTORY_MEASURE_LARGE_BYTES
# 出力: <私用dir>/report.json（集計だけ。合成本文は含めない）。DB の data directory は終了時に消す。
set -euo pipefail
umask 077

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# 手元の libpq 設定と接続先を継承しない。接続は新しい cluster の socket に固定する。
for pg_variable in ${!PG@}; do unset "$pg_variable"; done
unset DATABASE_URL
# psql の \timing 行（Time: ... ms）を数えるため、メッセージは英語に固定する。本文の文字コードは UTF-8 のまま。
export LC_MESSAGES=C PGCLIENTENCODING=UTF8
for binary in initdb pg_ctl psql; do
  command -v "$binary" >/dev/null || { printf '%s が PATH に無い（PostgreSQL 16 以上の bin を PATH に置く）\n' "$binary" >&2; exit 1; }
done
pg_major="$(initdb --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/')"
if (( pg_major < 16 )); then printf 'PostgreSQL 16 以上が必要（今は %s）\n' "$pg_major" >&2; exit 1; fi

positive_integer() { # <名前> <値>
  [[ "$2" =~ ^[1-9][0-9]{0,6}$ ]] || { printf '%s は 1 以上の整数で指定する（今は %s）\n' "$1" "$2" >&2; exit 64; }
}
burst_saves="${HISTORY_MEASURE_BURST_SAVES:-200}"
normal_saves="${HISTORY_MEASURE_NORMAL_SAVES:-15}"
small_bytes="${HISTORY_MEASURE_SMALL_BYTES:-33000}"
large_bytes="${HISTORY_MEASURE_LARGE_BYTES:-95000}"
positive_integer HISTORY_MEASURE_BURST_SAVES "$burst_saves"
positive_integer HISTORY_MEASURE_NORMAL_SAVES "$normal_saves"
positive_integer HISTORY_MEASURE_SMALL_BYTES "$small_bytes"
positive_integer HISTORY_MEASURE_LARGE_BYTES "$large_bytes"

# Unix socket のパス長上限（約100文字）に収めるため、長い TMPDIR ではなく /tmp に置く。
run_dir="$(mktemp -d /tmp/skillsheet-history-measure.XXXXXX)"
port=55450
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git_sha="$(git -C "$repo_dir" rev-parse HEAD 2>/dev/null || echo unknown)"
git_dirty="$( [[ -n "$(git -C "$repo_dir" status --porcelain 2>/dev/null)" ]] && echo true || echo false)"

cleanup() {
  if [[ -f "$run_dir/data/postmaster.pid" ]]; then pg_ctl -D "$run_dir/data" -m fast -w stop >>"$run_dir/server-stop.log" 2>&1 || true; fi
  # 合成DBの実体はディスクを食うので消す。集計（report.json）とログだけ残す。
  rm -rf -- "$run_dir/data"
}
finish() {
  local result=$?
  cleanup
  if (( result != 0 )); then printf '計測失敗。私用ログ: %s\n' "$run_dir" >&2; fi
  exit "$result"
}
trap finish EXIT

initdb -D "$run_dir/data" -U measure_admin --auth=trust --no-locale -E UTF8 >"$run_dir/init.log" 2>&1
# TCP を閉じ、0700 の socket directory だけで待ち受ける。
# autovacuum は止め、保存直後の「書いたままの大きさ（dead tuple 込み）」を最悪側として測る。詰めた大きさは VACUUM FULL 後に別に測る。
# 1 保存は数 ms で終わるので、log_lock_waits が書く閾値（deadlock_timeout）を最小の 1ms にして短い待ちも数える。
pg_ctl -D "$run_dir/data" -l "$run_dir/server.log" \
  -o "-c listen_addresses='' -k '$run_dir' -p $port -c autovacuum=off -c log_lock_waits=on -c deadlock_timeout=1ms" \
  -w start >/dev/null
admin=(psql -X -v ON_ERROR_STOP=1 -h "$run_dir" -p "$port" -U measure_admin -d postgres)
runtime=(psql -X -h "$run_dir" -p "$port" -U measure_runtime -d postgres)

for migration in "$repo_dir"/drizzle/migration/*.sql; do "${admin[@]}" -f "$migration" >>"$run_dir/migration.log" 2>&1; done
for stage in install-skillsheet-read-boundary install-skillsheet-write-boundary install-document-history; do
  "${admin[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/$stage.log" 2>&1
done

# 合成の保存者・本文・結果表。measure_fixture は計測用 cluster だけに作る。
"${admin[@]}" -q -v small="$small_bytes" -v large="$large_bytes" -v burst="$burst_saves" -v normal="$normal_saves" >"$run_dir/fixture.log" 2>&1 <<'SQL'
CREATE ROLE measure_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
INSERT INTO skillsheet_private.principals VALUES ('measure_runtime', 'measure-owner');
GRANT USAGE ON SCHEMA skillsheet_private TO measure_runtime;
GRANT EXECUTE ON FUNCTION skillsheet_private.create_sheet(uuid,text,jsonb,text),
  skillsheet_private.replace_sheet(uuid,text,text,jsonb,text),
  skillsheet_private.read_snapshot(uuid,text) TO measure_runtime;
CREATE SCHEMA measure_fixture;
GRANT USAGE ON SCHEMA measure_fixture TO measure_runtime;
CREATE TABLE measure_fixture.sheet(name text PRIMARY KEY, sheet_id uuid NOT NULL, target_bytes integer NOT NULL, saves integer NOT NULL);
INSERT INTO measure_fixture.sheet VALUES
  ('burst-small', 'aaaaaaaa-0000-4000-8000-000000000001', :small, :burst),
  ('burst-large', 'aaaaaaaa-0000-4000-8000-000000000002', :large, :burst),
  ('normal-small', 'aaaaaaaa-0000-4000-8000-000000000003', :small, :normal),
  ('normal-large', 'aaaaaaaa-0000-4000-8000-000000000004', :large, :normal),
  -- 2 つのタブが同じシートを保存し合う競合。writer ごとに別の本文を使うので、本文は 2 writer 分を用意する。
  ('contended', 'aaaaaaaa-0000-4000-8000-000000000005', :small, :normal * 2);
-- 1ブロック約3,000文字。保存ごとに1ブロックだけ本文を変える（自動保存は一部の編集で全文版を作るため）。
-- 本文は md5 の連結で、pglz がほぼ圧縮できない最悪側。実データの圧縮率は report の stored/logical で別に見る。
CREATE TABLE measure_fixture.payload(sheet_id uuid, iteration integer, blocks jsonb NOT NULL, PRIMARY KEY (sheet_id, iteration));
INSERT INTO measure_fixture.payload
SELECT s.sheet_id, i, (
  SELECT jsonb_agg(jsonb_build_object(
    'id', md5(s.sheet_id::text || ':' || b)::uuid, 'type', 'markdown', 'order', b,
    'data', jsonb_build_object('markdown', (
      SELECT left(string_agg(md5(s.sheet_id::text || ':' || b || ':' || CASE WHEN b = i % n.blocks THEN i::text ELSE 'base' END || ':' || k), ''), s.target_bytes / n.blocks)
      FROM generate_series(1, s.target_bytes / n.blocks / 32 + 1) k))) ORDER BY b)
  FROM generate_series(0, n.blocks - 1) b)
FROM measure_fixture.sheet s
CROSS JOIN LATERAL (SELECT greatest(1, s.target_bytes / 3000) AS blocks) n
CROSS JOIN LATERAL generate_series(0, s.saves) i;
GRANT SELECT ON measure_fixture.payload, measure_fixture.sheet TO measure_runtime;
CREATE TABLE measure_fixture.latency(scenario text, ms numeric);
CREATE TABLE measure_fixture.scenario(name text PRIMARY KEY, ord integer, detail jsonb);
-- 版数の照合に使う、シートごとの「結果が OK だった保存」の数。設定した保存数ではなく結果から数える。
CREATE TABLE measure_fixture.accepted(sheet text NOT NULL, scenario text NOT NULL, writer integer NOT NULL, accepted integer NOT NULL);
SQL

# 作成（revision 0）は計測対象外。
for name in burst-small burst-large normal-small normal-large contended; do
  "${runtime[@]}" -v ON_ERROR_STOP=1 -At -v name="$name" >>"$run_dir/create.log" 2>&1 <<'SQL'
SELECT skillsheet_private.create_sheet(s.sheet_id, '合成計測', p.blocks, 'measure-owner')->>'status'
FROM measure_fixture.sheet s JOIN measure_fixture.payload p ON p.sheet_id = s.sheet_id AND p.iteration = 0
WHERE s.name = :'name';
SQL
done

# writer 1 本分の psql script。アプリの自動保存と同じく、直前に受け取った revision で CAS する。
# CONFLICT や ERROR の後は最新の revision を読み直して続ける（別タブの保存に負けたタブが再読込する動き）。
# 1 回の失敗で以後の保存が全部 CONFLICT に連鎖しないよう、revision は固定値にしない。
# 読み直しは \timing を切って行い、保存遅延の標本に混ぜない。試行は status 行で数える。
save_script() { # <sheet name> <first payload iteration> <saves>
  local name=$1 first=$2 saves=$3 i
  local snapshot_revision="SELECT skillsheet_private.read_snapshot(s.sheet_id)#>>'{snapshot,revision}' AS rev FROM measure_fixture.sheet s WHERE s.name = '$name' \\gset"
  printf '%s\n\\timing on\n' "$snapshot_revision"
  for ((i = first; i < first + saves; i++)); do
    printf '\\set status ERROR\n\\set ok false\n\\set next_rev :rev\n'
    printf "SELECT q.r->>'status' AS status, q.r->>'status' = 'OK' AS ok, coalesce(q.r#>>'{snapshot,revision}', :'rev') AS next_rev FROM (SELECT skillsheet_private.replace_sheet(s.sheet_id, :'rev', '合成計測', p.blocks, 'measure-owner') AS r FROM measure_fixture.sheet s JOIN measure_fixture.payload p ON p.sheet_id = s.sheet_id AND p.iteration = %d WHERE s.name = '%s') q \\\\gset\n" "$i" "$name"
    printf '\\echo status=:status\n\\if :ok\n\\set rev :next_rev\n\\else\n\\timing off\n%s\n\\timing on\n\\endif\n' "$snapshot_revision"
  done
}
admin_value() { "${admin[@]}" -At -c "$1"; }
size_report() { PGOPTIONS='-c default_transaction_read_only=on' "${admin[@]}" -At -f "$repo_dir/script/sql/history-size-report.sql"; }

run_scenario() { # <scenario> <order> <sheet name>:<first payload iteration>:<saves>...（1 つが writer 1 本）
  local scenario=$1 order=$2
  shift 2
  local wal_before wal_after waits_before waits_after size_before size_after_write size_after_compact pids=() spec name first saves writer
  local sheets=()
  wal_before="$(admin_value 'SELECT pg_current_wal_lsn()')"
  waits_before="$(grep -c 'still waiting for' "$run_dir/server.log" || true)"
  size_before="$(size_report)"
  writer=0
  for spec in "$@"; do
    IFS=: read -r name first saves <<<"$spec"
    writer=$((writer + 1))
    save_script "$name" "$first" "$saves" >"$run_dir/$scenario-$writer.sql"
    [[ " ${sheets[*]-} " == *" $name "* ]] || sheets+=("$name")
  done
  local start_ms end_ms
  start_ms="$(admin_value "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)")"
  for ((writer = 1; writer <= $#; writer++)); do
    # 失敗も数えるため ON_ERROR_STOP を付けない。結果は status 行、SQL の ERROR は stderr の行数で数える。
    "${runtime[@]}" -At -f "$run_dir/$scenario-$writer.sql" >"$run_dir/$scenario-$writer.out" 2>"$run_dir/$scenario-$writer.err" &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid"; done
  end_ms="$(admin_value "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)")"
  wal_after="$(admin_value 'SELECT pg_current_wal_lsn()')"
  waits_after="$(grep -c 'still waiting for' "$run_dir/server.log" || true)"
  size_after_write="$(size_report)"
  "${admin[@]}" -q -c 'VACUUM FULL public.document_versions' >>"$run_dir/vacuum.log" 2>&1
  size_after_compact="$(size_report)"
  local attempts=0 accepted=0 conflicts=0 errors=0 out writer_attempts writer_accepted
  writer=0
  for spec in "$@"; do
    IFS=: read -r name first saves <<<"$spec"
    writer=$((writer + 1))
    out="$run_dir/$scenario-$writer.out"
    sed -nE 's/^Time: ([0-9.]+) ms.*/\1/p' "$out" | while read -r ms; do printf '%s\t%s\n' "$scenario" "$ms"; done >>"$run_dir/latency.tsv"
    writer_attempts="$(grep -c '^status=' "$out" || true)"
    writer_accepted="$(grep -cx 'status=OK' "$out" || true)"
    # 試行の数え漏れは失敗率を小さく見せるので、status 行が予定の保存数と揃わない run は止める。
    if (( writer_attempts != saves )); then
      printf '%s writer %s: 試行 %s 件で、予定の %s 件と合わない\n' "$scenario" "$writer" "$writer_attempts" "$saves" >&2
      exit 1
    fi
    attempts=$((attempts + writer_attempts))
    accepted=$((accepted + writer_accepted))
    conflicts=$((conflicts + $(grep -cx 'status=CONFLICT' "$out" || true)))
    errors=$((errors + $(grep -c 'ERROR:' "$run_dir/$scenario-$writer.err" || true)))
    admin_value "INSERT INTO measure_fixture.accepted VALUES ('$name', '$scenario', $writer, $writer_accepted)" >/dev/null
  done
  "${admin[@]}" -q \
    -v scenario="$scenario" -v ord="$order" -v sheets="${sheets[*]}" -v writers="$#" \
    -v attempts="$attempts" -v accepted="$accepted" -v conflicts="$conflicts" -v errors="$errors" \
    -v wal_before="$wal_before" -v wal_after="$wal_after" -v lock_waits="$((waits_after - waits_before))" \
    -v elapsed_ms="$((end_ms - start_ms))" -v before="$size_before" -v after_write="$size_after_write" -v after_compact="$size_after_compact" <<'SQL'
INSERT INTO measure_fixture.scenario VALUES (:'scenario', :ord, jsonb_build_object(
  'sheets', string_to_array(:'sheets', ' '),
  'concurrency', :writers,
  'payloadTargetBytes', (SELECT jsonb_agg(target_bytes ORDER BY name) FROM measure_fixture.sheet WHERE name = ANY(string_to_array(:'sheets', ' '))),
  'attempts', :attempts, 'accepted', :accepted, 'conflicts', :conflicts, 'errors', :errors,
  'failureRate', CASE WHEN :attempts = 0 THEN NULL ELSE round((:attempts - :accepted)::numeric / :attempts, 6) END,
  'lockWaits', :lock_waits,
  'elapsedMs', :elapsed_ms,
  'walBytes', pg_wal_lsn_diff(:'wal_after', :'wal_before'),
  'sizeBefore', :'before'::jsonb,
  'sizeAfterWrite', :'after_write'::jsonb,
  'sizeAfterCompact', :'after_compact'::jsonb));
SQL
  printf '%s: 保存 %s 件中 %s 件成功、CONFLICT %s 件、エラー %s 件、ロック待ち %s 回\n' "$scenario" "$attempts" "$accepted" "$conflicts" "$errors" "$((waits_after - waits_before))"
}

run_scenario burst-small 1 "burst-small:1:$burst_saves"
run_scenario burst-large 2 "burst-large:1:$burst_saves"
run_scenario normal-parallel 3 "normal-small:1:$normal_saves" "normal-large:1:$normal_saves"
# 同じシートを 2 writer が同時に保存する。writer 2 は本文を後半の iteration から取る。
run_scenario same-sheet-contention 4 "contended:1:$normal_saves" "contended:$((normal_saves + 1)):$normal_saves"
"${admin[@]}" -q -c "\\copy measure_fixture.latency FROM '$run_dir/latency.tsv'"

# 合成DB試験: シートごとに 版数 = 作成1 + 結果が OK だった保存数、最新 revision = OK の数。
# 設定した保存数ではなく結果で照合するので、CONFLICT（SQL の ERROR にならない拒否）があっても report は出る。
# 保存ごとに版が1つだけ増え、拒否された保存で版が増えないことを確かめる。
"${admin[@]}" -q >"$run_dir/assert.log" 2>&1 <<'SQL'
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT s.name, coalesce((SELECT sum(a.accepted) FROM measure_fixture.accepted a WHERE a.sheet = s.name), 0) AS accepted,
                  (SELECT count(*) FROM public.document_versions v WHERE v.sheet_id = s.sheet_id) AS versions,
                  (SELECT max(revision) FROM public.document_versions v WHERE v.sheet_id = s.sheet_id) AS latest
           FROM measure_fixture.sheet s LOOP
    IF r.versions <> r.accepted + 1 OR r.latest <> r.accepted THEN
      RAISE EXCEPTION 'version count mismatch for %: versions=% latest=% accepted=%', r.name, r.versions, r.latest, r.accepted;
    END IF;
  END LOOP;
  IF EXISTS (SELECT FROM public.document_versions WHERE action NOT IN ('create', 'save')) THEN
    RAISE EXCEPTION 'unexpected action in synthetic run';
  END IF;
END $$;
SQL
printf '合成DB試験（版数 = 作成 + OK の保存）: PASS\n'

finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"${admin[@]}" -At \
  -v git_sha="$git_sha" -v git_dirty="$git_dirty" -v started_at="$started_at" -v finished_at="$finished_at" \
  -v os="$(uname -sr)" -v command="./script/measure-document-history.sh" \
  -v burst="$burst_saves" -v normal="$normal_saves" -v small="$small_bytes" -v large="$large_bytes" \
  >"$run_dir/report.json" <<'SQL'
SELECT jsonb_pretty(jsonb_build_object(
  'tool', 'measure-document-history',
  'kind', 'synthetic-local-postgres',
  'note', '新規ローカルPostgreSQLの合成データ。Neon本番の実測ではない。保存遅延はUnix socket経由のpsql往復で、ネットワーク・アプリ処理を含まない。',
  'gitSha', :'git_sha', 'gitDirty', :'git_dirty'::boolean,
  'command', :'command',
  'startedAt', :'started_at', 'finishedAt', :'finished_at',
  'environment', jsonb_build_object('os', :'os', 'postgres', current_setting('server_version'), 'autovacuum', current_setting('autovacuum')),
  'samples', jsonb_build_object('burstSaves', :burst, 'normalSaves', :normal, 'smallTargetBytes', :small, 'largeTargetBytes', :large),
  'fixtureBytes', (SELECT sum(pg_total_relation_size(c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'measure_fixture' AND c.relkind = 'r'),
  'scenarios', (
    SELECT jsonb_agg(s.detail || jsonb_build_object(
      'name', s.name,
      'latencyMs', (SELECT jsonb_build_object(
        'samples', count(*),
        'min', min(ms), 'p50', percentile_disc(0.5) WITHIN GROUP (ORDER BY ms),
        'p95', percentile_disc(0.95) WITHIN GROUP (ORDER BY ms), 'max', max(ms))
        FROM measure_fixture.latency l WHERE l.scenario = s.name),
      'versionsAdded', (s.detail #>> '{sizeAfterWrite,versionCount}')::bigint - (s.detail #>> '{sizeBefore,versionCount}')::bigint
    ) ORDER BY s.ord)
    FROM measure_fixture.scenario s),
  'final', (SELECT detail -> 'sizeAfterCompact' FROM measure_fixture.scenario ORDER BY ord DESC LIMIT 1)
));
SQL
printf '計測結果（集計のみ）: %s\n' "$run_dir/report.json"
