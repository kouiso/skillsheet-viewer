#!/usr/bin/env bash
# 履歴保持 dry-run（#576）を新規ローカルclusterの合成データだけで通しで確かめる。
# 本番・共有DB・DATABASE_URL には接続しない。確かめること:
#   - snapshot は READ ONLY transaction で、SELECT だけの専用 role から取れる。本文・title を出さない。
#   - dry-run の前後で、版・削除・生存シート・台帳の件数と内容 hash が変わらない。
#   - 書込みを含む READ ONLY transaction は管理接続でも拒否される。apply 系の指定は CLI が拒否する。
#   - 案ごとの候補・保留、復元/Undo の参照保護、削除シート全削除との衝突が集計に出る。
# regression を付けると続けて #577 の回帰検証をする（doc/document-history-operation.md「回帰検証」）:
#   - READ ONLY の観測から監視が normal / exceeded / measurement-failed を返す。
#   - 段階的間引き案の候補を、この使い捨て cluster の中だけで外した後、一覧・読取・復元・Undo・削除復元・
#     owner 分離・runtime 直読拒否・未知 raw 保持がどうなるか。外した版を成功として返さないこと。
# 使い方: ./script/verify-history-retention.sh [regression]   （PostgreSQL 16 以上の bin を PATH に置く。node_modules が要る）
set -euo pipefail
umask 077
mode="${1:-dry-run}"
[[ "$mode" == dry-run || "$mode" == regression ]] || { printf '使い方: %s [regression]\n' "$0" >&2; exit 64; }

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for pg_variable in ${!PG@}; do unset "$pg_variable"; done
unset DATABASE_URL
export LC_MESSAGES=C PGCLIENTENCODING=UTF8
for binary in initdb pg_ctl psql node; do
  command -v "$binary" >/dev/null || { printf '%s が PATH に無い\n' "$binary" >&2; exit 1; }
done
pg_major="$(initdb --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/')"
if (( pg_major < 16 )); then printf 'PostgreSQL 16 以上が必要（今は %s）\n' "$pg_major" >&2; exit 1; fi
tsx="$repo_dir/node_modules/.bin/tsx"
[[ -x "$tsx" ]] || { printf 'node_modules が無い（pnpm install --frozen-lockfile を先に実行する）\n' >&2; exit 1; }

run_dir="$(mktemp -d /tmp/skillsheet-retention.XXXXXX)"
port=55451
cleanup() {
  if [[ -f "$run_dir/data/postmaster.pid" ]]; then pg_ctl -D "$run_dir/data" -m fast -w stop >>"$run_dir/server-stop.log" 2>&1 || true; fi
  rm -rf -- "$run_dir/data"
}
finish() {
  local result=$?
  cleanup
  if (( result != 0 )); then printf '検証失敗。私用ログ: %s\n' "$run_dir" >&2; fi
  exit "$result"
}
trap finish EXIT

initdb -D "$run_dir/data" -U retention_admin --auth=trust --no-locale -E UTF8 >"$run_dir/init.log" 2>&1
pg_ctl -D "$run_dir/data" -l "$run_dir/server.log" -o "-c listen_addresses='' -k '$run_dir' -p $port" -w start >/dev/null
admin=(psql -X -q -v ON_ERROR_STOP=1 -h "$run_dir" -p "$port" -U retention_admin -d postgres)
for migration in "$repo_dir"/drizzle/migration/*.sql; do "${admin[@]}" -f "$migration" >>"$run_dir/migration.log" 2>&1; done
for stage in install-skillsheet-read-boundary install-skillsheet-write-boundary install-document-history; do
  "${admin[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/$stage.log" 2>&1
done

"${admin[@]}" >"$run_dir/roles.log" 2>&1 <<'SQL'
CREATE ROLE retention_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
INSERT INTO skillsheet_private.principals VALUES ('retention_runtime', 'retention-owner');
GRANT USAGE ON SCHEMA skillsheet_private TO retention_runtime;
GRANT EXECUTE ON FUNCTION skillsheet_private.create_sheet(uuid,text,jsonb,text),
  skillsheet_private.replace_sheet(uuid,text,text,jsonb,text),
  skillsheet_private.delete_sheet(uuid,text,text),
  skillsheet_private.history_restore(uuid,text,text,text),
  skillsheet_private.restore_deleted_document(uuid,text,text),
  skillsheet_private.history_list(uuid,text,integer,text),
  skillsheet_private.history_read(uuid,text,text),
  skillsheet_private.history_count_after(uuid,text,text,text),
  skillsheet_private.deleted_document_list(text) TO retention_runtime;
CREATE ROLE retention_other LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
INSERT INTO skillsheet_private.principals VALUES ('retention_other', 'retention-other');
GRANT USAGE ON SCHEMA skillsheet_private TO retention_other;
GRANT EXECUTE ON FUNCTION skillsheet_private.history_list(uuid,text,integer,text),
  skillsheet_private.history_read(uuid,text,text),
  skillsheet_private.history_restore(uuid,text,text,text) TO retention_other;
-- dry-run 用の読取 role。SELECT だけで、既定の transaction も READ ONLY にする。
CREATE ROLE retention_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT SELECT ON public.document_versions, public.deleted_documents, public.skill_sheets, public.skillsheet_state TO retention_reader;
ALTER ROLE retention_reader SET default_transaction_read_only = on;
SQL

# 合成データ: A は保存・復元・Undo、B は削除済み、C は削除して復元。本文には検出用の目印を入れる。
psql -X -q -v ON_ERROR_STOP=1 -h "$run_dir" -p "$port" -U retention_runtime -d postgres >"$run_dir/seed.log" 2>&1 <<'SQL'
DO $$
DECLARE
  a uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  b uuid := 'aaaaaaaa-0000-4000-8000-00000000000b';
  c uuid := 'aaaaaaaa-0000-4000-8000-00000000000c';
  body jsonb;
  r jsonb;
  i integer;
BEGIN
  -- 作成時だけ未知型ブロックを入れ、間引き後の復元でも raw が欠けないことを後で確かめる。
  r := skillsheet_private.create_sheet(a, '合成A', jsonb_build_array(
    jsonb_build_object('id', 'aaaaaaaa-1111-4000-8000-000000000001', 'type', 'markdown', 'order', 0, 'data', jsonb_build_object('markdown', 'RETENTION_BODY_MARKER 0')),
    jsonb_build_object('id', 'aaaaaaaa-1111-4000-8000-000000000002', 'type', 'unknown-kind', 'order', 1, 'data', jsonb_build_object('raw', jsonb_build_array(1, NULL, '保存')))), 'retention-owner');
  IF r->>'status' <> 'OK' THEN RAISE EXCEPTION 'create a failed'; END IF;
  FOR i IN 1..20 LOOP
    body := jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-1111-4000-8000-000000000001', 'type', 'markdown', 'order', 0, 'data', jsonb_build_object('markdown', 'RETENTION_BODY_MARKER ' || i)));
    r := skillsheet_private.replace_sheet(a, (i - 1)::text, '合成A', body, 'retention-owner');
    IF r->>'status' <> 'OK' THEN RAISE EXCEPTION 'save a % failed', i; END IF;
  END LOOP;
  -- 版3へ戻す（版21: restored_from=3, restored_before=20）→ 取り消し（版22: restored_from=20, restored_before=21）。
  IF skillsheet_private.history_restore(a, '3', '20', 'retention-owner')#>>'{snapshot,revision}' <> '21' THEN RAISE EXCEPTION 'restore failed'; END IF;
  IF skillsheet_private.history_restore(a, '20', '21', 'retention-owner')#>>'{snapshot,revision}' <> '22' THEN RAISE EXCEPTION 'undo failed'; END IF;
  FOR i IN 23..27 LOOP
    body := jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-1111-4000-8000-000000000001', 'type', 'markdown', 'order', 0, 'data', jsonb_build_object('markdown', 'RETENTION_BODY_MARKER ' || i)));
    r := skillsheet_private.replace_sheet(a, (i - 1)::text, '合成A', body, 'retention-owner');
    IF r->>'status' <> 'OK' THEN RAISE EXCEPTION 'save a % failed', i; END IF;
  END LOOP;

  r := skillsheet_private.create_sheet(b, '合成B', jsonb_build_array(jsonb_build_object('id', 'bbbbbbbb-1111-4000-8000-000000000001', 'type', 'markdown', 'order', 0, 'data', jsonb_build_object('markdown', 'RETENTION_BODY_MARKER b0'))), 'retention-owner');
  FOR i IN 1..5 LOOP
    body := jsonb_build_array(jsonb_build_object('id', 'bbbbbbbb-1111-4000-8000-000000000001', 'type', 'markdown', 'order', 0, 'data', jsonb_build_object('markdown', 'RETENTION_BODY_MARKER b' || i)));
    PERFORM skillsheet_private.replace_sheet(b, (i - 1)::text, '合成B', body, 'retention-owner');
  END LOOP;
  IF skillsheet_private.delete_sheet(b, '5', 'retention-owner')->>'status' <> 'OK' THEN RAISE EXCEPTION 'delete b failed'; END IF;

  r := skillsheet_private.create_sheet(c, '合成C', jsonb_build_array(jsonb_build_object('id', 'cccccccc-1111-4000-8000-000000000001', 'type', 'markdown', 'order', 0, 'data', jsonb_build_object('markdown', 'RETENTION_BODY_MARKER c0'))), 'retention-owner');
  FOR i IN 1..3 LOOP
    body := jsonb_build_array(jsonb_build_object('id', 'cccccccc-1111-4000-8000-000000000001', 'type', 'markdown', 'order', 0, 'data', jsonb_build_object('markdown', 'RETENTION_BODY_MARKER c' || i)));
    PERFORM skillsheet_private.replace_sheet(c, (i - 1)::text, '合成C', body, 'retention-owner');
  END LOOP;
  IF skillsheet_private.delete_sheet(c, '3', 'retention-owner')->>'status' <> 'OK' THEN RAISE EXCEPTION 'delete c failed'; END IF;
  IF skillsheet_private.restore_deleted_document(c, '4', 'retention-owner')#>>'{snapshot,revision}' <> '5' THEN RAISE EXCEPTION 'restore c failed'; END IF;
END $$;
SQL

# 合成データだけ、記録時刻を過去へずらす（A は約400日前から5日前、B は約200日前に削除）。
# 起点は実行日の正午（日本時間）に固定する。now() 起点だと、実行した時刻や日付で
# 同じ日に置いたつもりの2版が日・月の境をまたぎ、段階的間引きの候補数が変わる。
"${admin[@]}" >"$run_dir/backdate.log" 2>&1 <<'SQL'
CREATE TEMP TABLE anchor AS
SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo') + interval '12 hours') AT TIME ZONE 'Asia/Tokyo' AS at;
-- 版22までは2版ずつ同じ日（段階的間引きで片方が候補になる）、版23以降は直近65日以内に置く。
UPDATE public.document_versions SET recorded_at = (SELECT at FROM anchor)
  - make_interval(days => CASE WHEN revision <= 22 THEN 400 - (revision::integer / 2) * 15 ELSE (27 - revision::integer) * 15 + 5 END)
  - make_interval(mins => (revision % 3)::integer)
WHERE sheet_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
UPDATE public.document_versions SET recorded_at = (SELECT at FROM anchor) - make_interval(days => 210 - revision::integer)
WHERE sheet_id = 'aaaaaaaa-0000-4000-8000-00000000000b';
UPDATE public.deleted_documents SET deleted_at = (SELECT at FROM anchor) - interval '200 days'
WHERE sheet_id = 'aaaaaaaa-0000-4000-8000-00000000000b';
SQL

fingerprint() {
  "${admin[@]}" -At <<'SQL'
SELECT jsonb_build_object(
  'versions', (SELECT count(*) FROM public.document_versions),
  'deleted', (SELECT count(*) FROM public.deleted_documents),
  'sheets', (SELECT count(*) FROM public.skill_sheets),
  'blocks', (SELECT count(*) FROM public.blocks),
  'hash', md5(concat_ws('|',
    (SELECT string_agg(md5(to_jsonb(v)::text), ',' ORDER BY sheet_id, revision) FROM public.document_versions v),
    (SELECT string_agg(md5(to_jsonb(d)::text), ',' ORDER BY sheet_id) FROM public.deleted_documents d),
    (SELECT string_agg(md5(to_jsonb(s)::text), ',' ORDER BY id) FROM public.skill_sheets s),
    (SELECT string_agg(md5(to_jsonb(b)::text), ',' ORDER BY id) FROM public.blocks b),
    (SELECT string_agg(md5(to_jsonb(t)::text), ',' ORDER BY owner_id) FROM public.skillsheet_state t)))
)::text;
SQL
}
before="$(fingerprint)"

reader=(psql -X -q -At -v ON_ERROR_STOP=1 -h "$run_dir" -p "$port" -U retention_reader -d postgres)
# SQL 冒頭の「実行:」行を書いてあるとおりに走らせる。手順書と検証で別の psql 引数を使うと、手順書だけ壊れても緑になる。
documented="$(sed -n 's/^-- 実行: //p' "$repo_dir/script/sql/history-retention-snapshot.sql")"
read -r -a documented_command <<<"$documented"
[[ "${documented_command[0]:-}" == psql && "$(grep -c '^-- 実行: ' "$repo_dir/script/sql/history-retention-snapshot.sql")" == 1 ]] \
  || { printf 'snapshot SQL の「実行:」行が1つの psql コマンドになっていない: %s\n' "$documented" >&2; exit 1; }
reader_env=(env PGHOST="$run_dir" PGPORT="$port" PGUSER=retention_reader PGDATABASE=postgres)
(cd -- "$repo_dir" && "${reader_env[@]}" "${documented_command[@]}") >"$run_dir/snapshot.json"
[[ "$(wc -l <"$run_dir/snapshot.json")" -eq 1 ]] || { printf '手順書の psql 出力が1行でない\n' >&2; exit 1; }
printf '手順書どおりの psql（%s）: PASS\n' "$documented"
# -q を抜いた取り方はコマンドタグが混ざる。dry-run が黙って読まず、理由付きで止まることを確かめる。
untagged=()
for word in "${documented_command[@]}"; do [[ "$word" == -q ]] || untagged+=("$word"); done
(cd -- "$repo_dir" && "${reader_env[@]}" "${untagged[@]}") >"$run_dir/snapshot-tagged.json"
grep -qx 'BEGIN' "$run_dir/snapshot-tagged.json" || { printf -- '-q 無しでコマンドタグが出なかった\n' >&2; exit 1; }
if "$tsx" "$repo_dir/script/history-retention-dry-run.ts" --snapshot "$run_dir/snapshot-tagged.json" >"$run_dir/tagged.out" 2>"$run_dir/tagged.err"; then
  printf 'コマンドタグ混じりの snapshot が通った\n' >&2; exit 1
fi
grep -q 'SNAPSHOT_NOT_JSON' "$run_dir/tagged.err" || { printf 'タグ混じり snapshot の拒否理由が違う\n' >&2; exit 1; }
printf -- '-q 抜けのタグ混じり snapshot は SNAPSHOT_NOT_JSON で停止: PASS\n'
if grep -q 'RETENTION_BODY_MARKER\|合成A' "$run_dir/snapshot.json"; then printf 'snapshot に本文または title が入った\n' >&2; exit 1; fi
printf 'READ ONLY snapshot（SELECT だけの role、本文・title なし）: PASS\n'

# 書込みの拒否: 専用 role は権限で、管理接続でも READ ONLY transaction で止まる。
if "${reader[@]}" -c 'DELETE FROM public.document_versions' >"$run_dir/reader-delete.log" 2>&1; then
  printf '読取 role で DELETE が通った\n' >&2; exit 1
fi
if "${admin[@]}" -c 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; DELETE FROM public.document_versions; COMMIT;' >"$run_dir/admin-ro-delete.log" 2>&1; then
  printf 'READ ONLY transaction で DELETE が通った\n' >&2; exit 1
fi
grep -q 'read-only transaction' "$run_dir/admin-ro-delete.log" || { printf 'READ ONLY 以外の理由で失敗した\n' >&2; exit 1; }
printf '書込み拒否（読取 role の DELETE、管理接続の READ ONLY 内 DELETE）: PASS\n'

if "$tsx" "$repo_dir/script/history-retention-dry-run.ts" --snapshot "$run_dir/snapshot.json" --apply >"$run_dir/apply.out" 2>"$run_dir/apply.err"; then
  printf 'apply 指定が通った\n' >&2; exit 1
fi
grep -q 'APPLY_NOT_SUPPORTED' "$run_dir/apply.err" || { printf 'apply 拒否の理由が違う\n' >&2; exit 1; }
printf 'apply 指定の拒否: PASS\n'

"$tsx" "$repo_dir/script/history-retention-dry-run.ts" --snapshot "$run_dir/snapshot.json" \
  --policy keep-all --policy window:30 --policy window:90 --policy tiered:30:365 >"$run_dir/dry-run.json"
"$tsx" "$repo_dir/script/history-retention-dry-run.ts" --snapshot "$run_dir/snapshot.json" \
  --policy tiered:30:365 --deleted-purge-days 90 >"$run_dir/dry-run-purge.json"
# 2回目も同じ結果になること（決定性）。
"$tsx" "$repo_dir/script/history-retention-dry-run.ts" --snapshot "$run_dir/snapshot.json" \
  --policy keep-all --policy window:30 --policy window:90 --policy tiered:30:365 >"$run_dir/dry-run-again.json"
cmp -s "$run_dir/dry-run.json" "$run_dir/dry-run-again.json" || { printf '同じ入力で結果が変わった\n' >&2; exit 1; }
if grep -q 'retention-owner\|RETENTION_BODY_MARKER\|合成' "$run_dir/dry-run.json" "$run_dir/dry-run-purge.json"; then
  printf 'dry-run の出力に owner・本文・title が入った\n' >&2; exit 1
fi

node - "$run_dir/dry-run.json" "$run_dir/dry-run-purge.json" <<'NODE'
const { readFileSync } = require('node:fs');
const [plans, purge] = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, 'utf8')).plans);
const fail = (message) => { console.error(message); process.exit(1); };
const [keepAll, window30, window90, tiered] = plans;
if (keepAll.totals.candidate !== 0 || keepAll.totals.hold !== 0) fail('全版保持で候補か保留が出た');
if (window30.totals.candidate <= window90.totals.candidate) fail('30日の方が90日より候補が少ない');
if (tiered.totals.candidate === 0) fail('段階的間引きで候補が出ない');
// A の版3（復元元）と版20（Undo先）は古い save だが参照で残る。
if ((window30.reasons.REFERENCED ?? 0) < 2) fail('復元・Undo の参照先が保護されていない');
if (purge[0].conflicts.length === 0) fail('削除シート全削除と常に残す版の衝突が報告されない');
if (purge[0].conflicts.some((item) => item.sheetId !== 'aaaaaaaa-0000-4000-8000-00000000000b')) fail('削除していないシートに衝突が出た');
for (const plan of [...plans, ...purge]) {
  if (plan.totals.versions !== plan.totals.keep + plan.totals.candidate + plan.totals.hold) fail('件数が合わない');
}
console.log(plans.map((plan) => `${plan.policy.policy.kind}${plan.policy.policy.keepDays ?? ''}: keep=${plan.totals.keep} candidate=${plan.totals.candidate} hold=${plan.totals.hold}`).join('\n'));
console.log(`tiered+削除90日: candidate=${purge[0].totals.candidate} conflicts=${purge[0].conflicts.length}`);
NODE
printf '案ごとの集計・参照保護・衝突報告・決定性: PASS\n'

after="$(fingerprint)"
[[ "$before" == "$after" ]] || { printf 'dry-run の前後で DB が変わった\n before=%s\n after=%s\n' "$before" "$after" >&2; exit 1; }
printf 'dry-run 前後の件数・内容 hash 不変: PASS (%s)\n' "$after"

if [[ "$mode" != regression ]]; then
  printf '私用ログ: %s\n' "$run_dir"
  exit 0
fi

# ---- #577 回帰検証 ----
# 監視: READ ONLY の観測（読取 role）を2点取り、正常・上限超過・計測失敗を確かめる。
monitor=("$tsx" "$repo_dir/script/history-capacity-monitor.ts")
"${reader[@]}" -f "$repo_dir/script/sql/history-size-report.sql" >"$run_dir/sample-1.json"
# 2点目は1日後として扱えるよう、観測時刻だけを書き換える（増え方の計算の通し確認用）。
"${reader[@]}" -f "$repo_dir/script/sql/history-size-report.sql" >"$run_dir/sample-2-raw.json"
node -e 'const fs=require("node:fs");const [src,dst]=process.argv.slice(1);const s=JSON.parse(fs.readFileSync(src,"utf8"));s.measuredAt=new Date(Date.parse(s.measuredAt)+86400000).toISOString();fs.writeFileSync(dst,JSON.stringify(s));' "$run_dir/sample-2-raw.json" "$run_dir/sample-2.json"
"${monitor[@]}" --sample "$run_dir/sample-1.json" --sample "$run_dir/sample-2.json" >"$run_dir/monitor-normal.json"
grep -q '"status": "normal"' "$run_dir/monitor-normal.json" || { printf '監視が normal を返さない\n' >&2; exit 1; }
monitor_status=0
# 合成の履歴は 1MiB に満たないので、DB 全体（新規 cluster でも数 MiB ある）の上限を 1MiB にして超過させる。
"${monitor[@]}" --sample "$run_dir/sample-2.json" --database-limit-mib 1 >"$run_dir/monitor-exceeded.json" || monitor_status=$?
(( monitor_status == 3 )) && grep -q '"automaticAction": "none"' "$run_dir/monitor-exceeded.json" || { printf '上限超過が exit 3 にならない\n' >&2; exit 1; }
# 書込み可能な transaction で取った観測は、監視が失敗として扱う。
"${admin[@]}" -At -f "$repo_dir/script/sql/history-size-report.sql" >"$run_dir/sample-writable.json"
monitor_status=0
"${monitor[@]}" --sample "$run_dir/sample-writable.json" >"$run_dir/monitor-failed.json" || monitor_status=$?
(( monitor_status == 4 )) || { printf 'READ ONLY でない観測が計測失敗にならない\n' >&2; exit 1; }
before_versions="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).versionCount)' "$run_dir/sample-1.json")"
printf '監視（normal / exceeded=3 / measurement-failed=4、自動処理なし）: PASS（観測時の版数 %s）\n' "$before_versions"

# 段階的間引き案の候補を求める。CLI は集計しか出さないので、同じ評価関数を検証用に直接呼ぶ。
cat >"$run_dir/candidates.ts" <<TS
import { readFileSync } from 'node:fs';
import { evaluateRetention, parseHistorySnapshot } from '$repo_dir/src/db/history-retention';
const snapshot = parseHistorySnapshot(JSON.parse(readFileSync('$run_dir/snapshot.json', 'utf8')));
const plan = evaluateRetention(snapshot, { policy: { kind: 'tiered', fullDays: 30, dailyUntilDays: 365 }, deletedSheetPurgeDays: null, timeZone: 'Asia/Tokyo' }, snapshot.takenAt);
for (const item of plan.decisions) if (item.decision === 'candidate') console.log(item.sheetId + ',' + item.revision);
TS
"$tsx" "$run_dir/candidates.ts" >"$run_dir/candidates.csv"
[[ -s "$run_dir/candidates.csv" ]] || { printf '候補が無く、回帰検証にならない\n' >&2; exit 1; }
removed_target="$(sed -nE 's/^aaaaaaaa-0000-4000-8000-00000000000a,([0-9]+)$/\1/p' "$run_dir/candidates.csv" | head -n 1)"
[[ -n "$removed_target" ]] || { printf 'A に候補が無い\n' >&2; exit 1; }
(( $(grep -c '^aaaaaaaa-0000-4000-8000-00000000000a,' "$run_dir/candidates.csv") >= 3 )) || { printf 'A の候補が少なすぎる\n' >&2; exit 1; }
if grep -qE '^aaaaaaaa-0000-4000-8000-00000000000a,(0|3|20|21|22|27)$' "$run_dir/candidates.csv"; then
  printf '常に残す版か参照先が候補に入った\n' >&2; exit 1
fi

# 候補を外すのは、このスクリプトが作った合成 cluster の中だけ。目印の無い DB では実行しない。
"${admin[@]}" >"$run_dir/remove.log" 2>&1 <<SQL
DO \$\$ BEGIN
  IF (SELECT count(*) FROM public.document_versions WHERE sheet_id NOT IN ('aaaaaaaa-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-00000000000b','aaaaaaaa-0000-4000-8000-00000000000c')) <> 0
  THEN RAISE EXCEPTION 'synthetic fixture only'; END IF;
END \$\$;
CREATE TEMP TABLE removed(sheet_id uuid, revision bigint);
\copy removed FROM '$run_dir/candidates.csv' WITH (FORMAT csv)
DELETE FROM public.document_versions v USING removed r WHERE v.sheet_id = r.sheet_id AND v.revision = r.revision;
SQL
removed_count="$(wc -l <"$run_dir/candidates.csv" | tr -d ' ')"

runtime=(psql -X -q -v ON_ERROR_STOP=1 -h "$run_dir" -p "$port" -U retention_runtime -d postgres)
"${runtime[@]}" -v removed="$removed_target" >"$run_dir/regression.log" 2>&1 <<'SQL'
SELECT set_config('regression.removed', :'removed', false);
DO $$
DECLARE
  a uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  b uuid := 'aaaaaaaa-0000-4000-8000-00000000000b';
  listed jsonb;
  r jsonb;
  current text;
  removed text;
BEGIN
  removed := current_setting('regression.removed');
  -- 外した版のすぐ上から1件だけ読み、外した版が一覧に出ないことを確かめる。
  listed := skillsheet_private.history_list(a, (removed::bigint + 1)::text, 1, 'retention-owner');
  IF listed->0->>'revision' = removed THEN RAISE EXCEPTION 'removed version still listed'; END IF;
  IF skillsheet_private.history_read(a, removed, 'retention-owner')->>'status' <> 'NOT_FOUND' THEN RAISE EXCEPTION 'removed version readable'; END IF;
  current := skillsheet_private.history_list(a, NULL, 1, 'retention-owner')->0->>'revision';
  -- 外した版への復元は NOT_FOUND で、シートを変えない。
  IF skillsheet_private.history_restore(a, removed, current, 'retention-owner')->>'status' <> 'NOT_FOUND' THEN RAISE EXCEPTION 'restore to removed version did not fail'; END IF;
  IF (skillsheet_private.history_list(a, NULL, 1, 'retention-owner')->0->>'revision') <> current THEN RAISE EXCEPTION 'failed restore changed the sheet'; END IF;
  -- 参照で残した復元元（版3）と Undo 先（版20）は読めて、戻せる。
  IF skillsheet_private.history_read(a, '3', 'retention-owner')->>'status' <> 'OK' THEN RAISE EXCEPTION 'restore source lost'; END IF;
  IF skillsheet_private.history_read(a, '20', 'retention-owner')->>'status' <> 'OK' THEN RAISE EXCEPTION 'undo target lost'; END IF;
  r := skillsheet_private.history_restore(a, '20', current, 'retention-owner');
  IF r->>'status' <> 'OK' OR r#>>'{snapshot,revision}' <> (current::bigint + 1)::text THEN RAISE EXCEPTION 'restore to kept version failed'; END IF;
  -- 作成版（未知型ブロック入り）への復元で raw が欠けない。
  r := skillsheet_private.history_restore(a, '0', (current::bigint + 1)::text, 'retention-owner');
  IF r->>'status' <> 'OK' OR NOT (r#>'{snapshot,blocks}') @> '[{"type":"unknown-kind","data":{"raw":[1,null,"保存"]}}]' THEN RAISE EXCEPTION 'unknown raw lost'; END IF;
  -- 後続件数は実際に残っている版の数で、版番号の差ではない。
  IF (skillsheet_private.history_count_after(a, '1', '27', 'retention-owner')#>>'{}')::bigint >= 26 THEN RAISE EXCEPTION 'count ignores removed versions'; END IF;
  -- 削除シートは deleted_documents の指す版が残り、復元できる。
  r := skillsheet_private.restore_deleted_document(b, '6', 'retention-owner');
  IF r#>>'{snapshot,revision}' IS DISTINCT FROM '7' THEN RAISE EXCEPTION 'deleted sheet restore failed: %', r; END IF;
  -- runtime から履歴表を直接読めない。
  BEGIN PERFORM * FROM public.document_versions; RAISE EXCEPTION 'direct table read permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SQL
psql -X -q -v ON_ERROR_STOP=1 -h "$run_dir" -p "$port" -U retention_other -d postgres >"$run_dir/regression-other.log" 2>&1 <<'SQL'
DO $$ BEGIN
  IF skillsheet_private.history_list('aaaaaaaa-0000-4000-8000-00000000000a', NULL, 20, 'retention-other') <> '[]'::jsonb THEN RAISE EXCEPTION 'cross owner list'; END IF;
  BEGIN PERFORM skillsheet_private.history_read('aaaaaaaa-0000-4000-8000-00000000000a', '3', 'retention-owner'); RAISE EXCEPTION 'owner spoof'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SQL
printf '候補 %s 版を外した後の一覧・読取・復元(NOT_FOUND)・参照先の復元・Undo・未知raw・削除復元・owner分離・直読拒否: PASS\n' "$removed_count"
printf '私用ログ: %s\n' "$run_dir"
