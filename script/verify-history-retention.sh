#!/usr/bin/env bash
# 履歴保持 dry-run（#576）を新規ローカルclusterの合成データだけで通しで確かめる。
# 本番・共有DB・DATABASE_URL には接続しない。確かめること:
#   - snapshot は READ ONLY transaction で、SELECT だけの専用 role から取れる。本文・title を出さない。
#   - dry-run の前後で、版・削除・生存シート・台帳の件数と内容 hash が変わらない。
#   - 書込みを含む READ ONLY transaction は管理接続でも拒否される。apply 系の指定は CLI が拒否する。
#   - 案ごとの候補・保留、復元/Undo の参照保護、削除シート全削除との衝突が集計に出る。
# 使い方: ./script/verify-history-retention.sh   （PostgreSQL 16 以上の bin を PATH に置く。node_modules が要る）
set -euo pipefail
umask 077

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
  skillsheet_private.restore_deleted_document(uuid,text,text) TO retention_runtime;
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

# 合成データだけ、記録時刻を過去へずらす（A は約420日前から15日前、B は約200日前に削除）。
"${admin[@]}" >"$run_dir/backdate.log" 2>&1 <<'SQL'
UPDATE public.document_versions SET recorded_at = now() - make_interval(days => 420 - revision::integer * 15) - make_interval(mins => (revision % 3)::integer)
WHERE sheet_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
UPDATE public.document_versions SET recorded_at = now() - make_interval(days => 210 - revision::integer)
WHERE sheet_id = 'aaaaaaaa-0000-4000-8000-00000000000b';
UPDATE public.deleted_documents SET deleted_at = now() - interval '200 days'
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
"${reader[@]}" -f "$repo_dir/script/sql/history-retention-snapshot.sql" >"$run_dir/snapshot.json"
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
printf '私用ログ: %s\n' "$run_dir"
