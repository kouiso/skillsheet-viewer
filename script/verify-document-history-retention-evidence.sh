#!/usr/bin/env bash
# 保存期限処理（2026-10-14 決定、#564）の証跡を作る。
# 新規ローカルclusterだけに接続し、合成データ（1シート400日分・1日20版のsave と
# 100日前に削除したシート1件）で、適用前→dry-run→apply後の版数と容量を表にする。
# 結果のHTML表を npx playwright でPNGにして /tmp/k564-evidence/ へ置く。PNGはコミットしない。
# 秘密値・既存DATABASE_URLは使用しない。本番・Neonへは接続しない。
set -euo pipefail
umask 077
pg_major="$(initdb --version | sed -E 's/.* ([0-9]+)\..*/\1/')"
if (( pg_major < 16 )); then printf 'PostgreSQL 16以上のbinをPATHへ指定してください。\n' >&2; exit 1; fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
run_dir="$(mktemp -d /tmp/skillsheet-retention-evidence.XXXXXX)"
out_dir=/tmp/k564-evidence
mkdir -p "$out_dir"
for pg_variable in ${!PG@}; do unset "$pg_variable"; done
unset DATABASE_URL
NOW='2026-10-15T12:00:00+09:00'
cleanup() {
 if [[ -f "$run_dir/bridge.pid" ]]; then kill "$(<"$run_dir/bridge.pid")" 2>/dev/null || true; fi
 if [[ -f "$run_dir/data/postmaster.pid" ]]; then pg_ctl -D "$run_dir/data" -m fast -w stop >>"$run_dir/server.log" 2>&1; fi
}
trap cleanup EXIT
initdb -D "$run_dir/data" -U history_admin --auth=trust --no-locale -E UTF8 >"$run_dir/init.log" 2>&1
pg_ctl -D "$run_dir/data" -l "$run_dir/server.log" -o "-c listen_addresses='' -k '$run_dir' -p 55449" -w start >/dev/null
args=(-X -v ON_ERROR_STOP=1 -h "$run_dir" -p 55449 -U history_admin -d postgres)
printf '私用証跡: %s\n' "$run_dir"
for migration in "$repo_dir"/drizzle/migration/*.sql; do psql "${args[@]}" -f "$migration" >>"$run_dir/migration.log" 2>&1; done
for stage in install-skillsheet-read-boundary install-skillsheet-write-boundary install-document-history install-document-history-retention; do
 psql "${args[@]}" -f "$repo_dir/script/sql/$stage.sql" >"$run_dir/$stage.log" 2>&1
 printf '%s: PASS\n' "$stage"
done

# 合成データ: 生存シート1枚（400日分・1日20版のsave=8000版。INSERTでtriggerがcreate版を1つ記録）
# と、100日前に削除されたシート1枚（5版+ledger）。
psql "${args[@]}" >"$run_dir/seed.log" <<'SQL'
INSERT INTO public.skill_sheets(id,owner_id,title,revision,is_default)
 VALUES('00000000-0000-4000-8000-000000000001','evidence-owner','合成シート',8001,true);
INSERT INTO public.document_versions(sheet_id,owner_id,revision,title,blocks,action,recorded_at,transaction_id)
 SELECT '00000000-0000-4000-8000-000000000001','evidence-owner',rev,'合成シート',
  jsonb_build_array(jsonb_build_object('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01','type','markdown','order',0,
    'data',jsonb_build_object('markdown',repeat('synthetic ',80)))),
  'save',
  '2026-10-15T12:00:00+09:00'::timestamptz - make_interval(days => (rev-1)/20, mins => (rev-1)%20),
  rev
 FROM generate_series(1,8000) rev;
INSERT INTO public.document_versions(sheet_id,owner_id,revision,title,blocks,action,recorded_at,transaction_id)
 SELECT '00000000-0000-4000-8000-000000000002','evidence-owner',rev,'削除済みシート',
  jsonb_build_array(jsonb_build_object('id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01','type','markdown','order',0,
    'data',jsonb_build_object('markdown',repeat('synthetic ',80)))),
  CASE WHEN rev=5 THEN 'delete' ELSE 'save' END,
  '2026-07-06T12:00:00+09:00'::timestamptz + make_interval(mins => rev),
  9000+rev
 FROM generate_series(1,5) rev;
INSERT INTO public.deleted_documents(sheet_id,owner_id,revision,deleted_at)
 VALUES('00000000-0000-4000-8000-000000000002','evidence-owner',5,'2026-07-06T12:00:00+09:00');
SQL

# WebSocket→Unixソケットの橋渡しを立て、tsxスクリプトが隔離DBへだけ接続できるようにする。
(cd "$repo_dir" && setsid nohup pnpm exec tsx script/e2e-db-bridge.ts "$run_dir" >"$run_dir/bridge.log" 2>&1 </dev/null &)
waited=0
until [[ -s "$run_dir/proxy" ]]; do
 if [[ -f "$run_dir/bridge.pid" ]] && ! kill -0 "$(<"$run_dir/bridge.pid")" 2>/dev/null; then
  echo '橋渡しが起動直後に終了した:' >&2; cat "$run_dir/bridge.log" >&2; exit 1
 fi
 ((waited >= 600)) && { echo '橋渡しが起動しなかった:' >&2; cat "$run_dir/bridge.log" >&2; exit 1; }
 sleep 0.1; waited=$((waited + 1))
done
proxy=$(<"$run_dir/proxy")

history_stat() {
 psql "${args[@]}" -At -c "SELECT count(*)||'|'||pg_total_relation_size('public.document_versions') FROM public.document_versions;"
}
run_prune() {
 (cd "$repo_dir" && NODE_OPTIONS="--import $repo_dir/script/isolated-neon-preload.mjs" \
  DATABASE_URL='postgresql://history_admin@localhost/postgres' ISOLATED_NEON_PROXY="$proxy" \
  pnpm exec tsx script/prune-document-history.ts --now "$NOW" "$@")
}

before_stat=$(history_stat)
run_prune >"$run_dir/dry-run.json"
run_prune --apply >"$run_dir/apply.json"
after_stat=$(history_stat)

before_versions=${before_stat%%|*}
before_bytes=${before_stat##*|}
after_versions=${after_stat%%|*}
after_bytes=${after_stat##*|}
thin_versions=$(node -e "const r=require('$run_dir/dry-run.json');console.log(r.thin.versions+'|'+r.thin.bytes+'|'+r.purge.sheets+'|'+r.purge.versions+'|'+r.purge.bytes)")
apply_thin=$(node -e "const r=require('$run_dir/apply.json');console.log(r.thin.versions+'|'+r.purge.sheets+'|'+r.purge.versions)")

thin_v=${thin_versions%%|*}; rest=${thin_versions#*|}
thin_b=${rest%%|*}; rest=${rest#*|}
purge_s=${rest%%|*}; rest=${rest#*|}
purge_v=${rest%%|*}; purge_b=${rest##*|}

a_thin=${apply_thin%%|*}; rest=${apply_thin#*|}
a_purge_s=${rest%%|*}; a_purge_v=${rest##*|}
[[ "$a_thin" == "$thin_v" && "$a_purge_s" == "$purge_s" && "$a_purge_v" == "$purge_v" ]] || {
 echo 'dry-runの集計とapplyの実削除が一致しません' >&2; cat "$run_dir/dry-run.json" "$run_dir/apply.json" >&2; exit 1; }
(( after_versions < before_versions )) || { echo 'apply後に版数が減っていません' >&2; exit 1; }

fmt_html() {
 cat <<EOF
<!doctype html><meta charset="utf-8"><style>
body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;margin:40px;color:#1a1a1a}
h1{font-size:22px} table{border-collapse:collapse;font-size:15px;margin-top:12px}
th,td{border:1px solid #999;padding:6px 14px;text-align:right} th{background:#eee;text-align:left}
td.l{text-align:left} .note{margin-top:10px;font-size:13px;color:#555}
</style>
$1
EOF
}

fmt_html "<h1>版履歴 retention 適用前（retention なし）— 合成データ #564</h1>
<p>合成データ: 生存シート1枚・400日分・1日20版の save + trigger記録 create 1版 ／ 100日前に削除したシート1枚（5版+ledger）</p>
<table><tr><th>対象</th><th>版数</th><th>容量(document_versions+索引)</th></tr>
<tr><td class='l'>document_versions 全版</td><td>${before_versions}</td><td>${before_bytes} bytes</td></tr>
<tr><td class='l'>deleted_documents（削除ledger）</td><td>1</td><td>—</td></tr></table>" >"$out_dir/before.html"

fmt_html "<h1>版履歴 retention dry-run と apply 後 — 合成データ #564</h1>
<p>基準時刻 ${NOW} ／ 全版保持30日（容量未超過）</p>
<table><tr><th>区分</th><th>件数</th><th>bytes</th></tr>
<tr><td class='l'>dry-run 間引き候補（thin）</td><td>${thin_v}</td><td>${thin_b}</td></tr>
<tr><td class='l'>dry-run 永久削除シート（purge）</td><td>${purge_s} シート / ${purge_v} 版</td><td>${purge_b}</td></tr>
<tr><td class='l'>apply 後 document_versions 全版</td><td>${after_versions}</td><td>${after_bytes} bytes</td></tr></table>
<p class='note'>dry-runの件数とapplyの実削除は一致を確認済み。削除前 ${before_versions} 版 / ${before_bytes} bytes</p>" >"$out_dir/after.html"

npx playwright screenshot --browser=chromium --viewport-size=820,360 "file://$out_dir/before.html" "$out_dir/before.png" >"$run_dir/shot.log" 2>&1
npx playwright screenshot --browser=chromium --viewport-size=860,400 "file://$out_dir/after.html" "$out_dir/after.png" >>"$run_dir/shot.log" 2>&1
printf '証跡: %s/before.png %s/after.png\n' "$out_dir" "$out_dir"
printf 'before: %s 版 / %s bytes → dry-run thin=%s purge=%sシート/%s版 → after: %s 版 / %s bytes\n' \
 "$before_versions" "$before_bytes" "$thin_v" "$purge_s" "$purge_v" "$after_versions" "$after_bytes"
