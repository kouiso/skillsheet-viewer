#!/usr/bin/env bash
# e2e 専用の使い捨て PostgreSQL を、実行ごとに立てて捨てる。CI と手元で同じ手順を使う。
#
# 共有の Neon DB を毎回 drop + create する方式では、別の実行と同時に走ると互いの DB を消し合うため、
# CI 全体で e2e を 1 本ずつに直列化していた。待ち行列に新しい実行が来ると古い待機は cancel され、
# 緑の PR が何度も押し出されていた。実行ごとに自分専用の DB を持てば、直列化そのものが要らない。
#
# - ネットワークには出さない。Unix ソケットだけで待ち受ける（TCP は閉じる）
# - アプリは @neondatabase/serverless の WebSocket ドライバで DB に入るため、Unix ソケットへの橋渡しを
#   script/e2e-db-bridge.ts が担い、ドライバ側は script/isolated-neon-preload.mjs で向け先を切り替える
# - 接続する role は Neon の owner role と同じ権限（スーパーユーザーではなく、role を作れる所有者）に
#   揃える。スーパーユーザーだと GRANT の漏れが e2e で見えなくなるため
# - 本番・共有の DB には接続しない。e2e を動かす側（playwright.config.ts / headless-e2e.mjs）は
#   script/require-isolated-db.mjs（.ts は再公開）で、この DB 以外へ向いていれば起動しない
#
# 使い方:
#   ./script/e2e-isolated-db.sh up   <作業ディレクトリ（絶対パス・新規）>   # 起動し <dir>/env を書く
#   ./script/e2e-isolated-db.sh down <作業ディレクトリ>                     # 止めて消す
#   ./script/e2e-isolated-db.sh run  <コマンド...>                          # 起動 → コマンド → 後片付け（手元用）
#
# 手元の例: ./script/e2e-isolated-db.sh run pnpm test:e2e:playwright
# （SESSION_SECRET / VIEWER_CODE / REVALIDATE_SECRET は .env.local から読まれる。DB だけがこの DB になる）
set -euo pipefail

# 手元の libpq 環境（PGOPTIONS / PGSERVICE / PGSSLMODE など）を継承しない。接続は新しい cluster の socket に固定する。
for pg_variable in ${!PG@}; do [[ "$pg_variable" == PG_BIN ]] || unset "$pg_variable"; done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=55440 # isolated-db-bridge.ts がソケット名 .s.PGSQL.55440 を前提にしている
OWNER_ROLE=e2e_owner
ADMIN_ROLE=e2e_admin
E2E_EMAIL=${E2E_EMAIL:-e2e-owner@example.test}
# 捨て用アカウントの平文既定値。公開リポジトリに置く値なので、この使い捨て DB 上の一時ユーザーにだけ使う。
E2E_PASSWORD=${E2E_PASSWORD:-E2e-test-pass-99}

usage() {
  echo "usage: $0 up|down <absolute work dir> | run <command...>" >&2
  exit 64
}

log() { printf '[e2e-isolated-db] %s\n' "$*"; }

pg_bin() {
  if [[ -n "${PG_BIN:-}" ]]; then
    printf '%s' "$PG_BIN"
    return
  fi
  local found
  found=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n 1 || true)
  [[ -n "$found" ]] || {
    echo "PostgreSQL のサーバー（initdb / pg_ctl）が見つからない。PG_BIN で指定する。" >&2
    return 1
  }
  printf '%s' "$found"
}

psql_as() { # <role> <dir> <psql args...>
  local role=$1 dir=$2
  shift 2
  psql -X -v ON_ERROR_STOP=1 -h "$dir/sock" -p "$PORT" -U "$role" -d postgres "$@"
}

up() {
  local dir=$1 bin
  [[ "$dir" == /* ]] || usage
  [[ ! -e "$dir" ]] || {
    echo "作業ディレクトリは新規に作る: $dir" >&2
    return 1
  }
  bin=$(pg_bin)
  mkdir -m 700 "$dir" "$dir/sock"
  # 管理用の role は、DB の所有者を渡すためだけに使う。ローカルのソケット経由のみなので trust で足りる。
  "$bin/initdb" -D "$dir/data" -U "$ADMIN_ROLE" -A trust -E UTF8 --locale=C >"$dir/initdb.log" 2>&1
  "$bin/pg_ctl" start -w -D "$dir/data" -l "$dir/server.log" \
    -o "-c listen_addresses= -c unix_socket_directories=$dir/sock -c port=$PORT -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
    >/dev/null
  psql_as "$ADMIN_ROLE" "$dir" -q <<SQL
CREATE ROLE ${OWNER_ROLE} LOGIN NOSUPERUSER CREATEROLE;
ALTER DATABASE postgres OWNER TO ${OWNER_ROLE};
SQL

  # WebSocket → Unix ソケットの橋渡し。後続の step より長く生きるので、親から切り離して起動する。
  (cd "$REPO_ROOT" && setsid nohup pnpm exec tsx script/e2e-db-bridge.ts "$dir" >"$dir/bridge.log" 2>&1 </dev/null &)
  local waited=0
  until [[ -s "$dir/proxy" ]]; do
    # 起動直後に落ちたなら、タイムアウトを待たずに原因を出す。
    if [[ -f "$dir/bridge.pid" ]] && ! kill -0 "$(<"$dir/bridge.pid")" 2>/dev/null; then
      echo "橋渡しが起動直後に終了した:" >&2
      cat "$dir/bridge.log" >&2 || true
      return 1
    fi
    if ((waited >= 600)); then
      echo "橋渡しが起動しなかった:" >&2
      cat "$dir/bridge.log" >&2 || true
      return 1
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  local proxy
  proxy=$(<"$dir/proxy")
  local app_url="postgresql://${OWNER_ROLE}@localhost/postgres"

  # アプリと同じ経路（Neon ドライバ → 橋渡し）で DB に入る node プロセス用の環境（owner の作成に使う）。
  # NODE_OPTIONS は全ての node プロセスに効くので、必要な呼び出しにだけ付ける。
  node_in_db() {
    (
      cd "$REPO_ROOT" &&
        NODE_OPTIONS="--import $REPO_ROOT/script/isolated-neon-preload.mjs" \
          DATABASE_URL="$app_url" ISOLATED_NEON_PROXY="$proxy" BETTER_AUTH_SECRET="$secret" \
          pnpm exec tsx "$@"
    )
  }

  local secret=${BETTER_AUTH_SECRET:-}
  [[ -n "$secret" ]] || secret=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')

  # スキーマの作成。verify-document-db.sh と同じく、migration の SQL を順に psql で流す
  # （このリポジトリに入っている Postgres のドライバは Neon の WebSocket 版だけで、隔離 DB へは橋渡し経由でしか入れない）。
  # アプリは migration の記録表（drizzle.__drizzle_migrations）を読まないので、e2e の前提は変わらない。
  local migration
  for migration in "$REPO_ROOT"/drizzle/migration/*.sql; do
    psql_as "$OWNER_ROLE" "$dir" -q -f "$migration" >>"$dir/migrate.log" 2>&1 || {
      echo "migration が失敗した ($migration):" >&2
      cat "$dir/migrate.log" >&2
      return 1
    }
  done

  # 編集者系テストは /builder のオーナーゲート（session.user.id === SKILLSHEET_OWNER_ID）を通る必要がある。
  # 外から渡す e2e ユーザーと SKILLSHEET_OWNER_ID が食い違うと /builder が /login へリダイレクトし、
  # ボタン待ちのテストが全てタイムアウトまでハングする（2026-09-14 に e2e 全体が赤化した）。
  # そのため実行ごとに e2e 専用ユーザーを作り、その user.id を SKILLSHEET_OWNER_ID として後続へ渡す。
  local owner_id
  owner_id=$(node_in_db script/bootstrap-owner.ts --email="$E2E_EMAIL" --password="$E2E_PASSWORD" --name="E2E Owner" | tail -n 1 | tr -d '[:space:]') || {
    echo "e2e の owner を作れなかった（bootstrap-owner の出力は上）" >&2
    return 1
  }
  [[ -n "$owner_id" ]] || {
    echo "e2e の owner を作れなかった" >&2
    return 1
  }

  # 失敗した SQL の出力は、原因が分かるようにその場で出して止める。
  sql() {
    psql_as "$OWNER_ROLE" "$dir" -q "$@" >>"$dir/sql.log" 2>&1 || {
      echo "SQL の導入が失敗した ($*):" >&2
      cat "$dir/sql.log" >&2
      return 1
    }
  }
  # 文書境界（skillsheet_private スキーマ＋関数）は drizzle migration の外側にある管理 SQL。
  # allow_existing_role は psql 変数で渡す（Neon pooler は startup parameter を通さないため PGOPTIONS では届かない）。
  sql -v allow_existing_role=on -f "$REPO_ROOT/script/sql/install-skillsheet-read-boundary.sql"
  sql -v allow_existing_role=on -f "$REPO_ROOT/script/sql/install-skillsheet-write-boundary.sql"
  sql -v owner_id="$owner_id" -f "$REPO_ROOT/script/sql/grant-e2e-runtime.sql"
  # migration 0011 はテーブルだけを作る。履歴関数・snapshot trigger は正本の installer で導入しないと、
  # 保存が履歴を残さない DB で e2e が通ってしまう。
  sql -f "$REPO_ROOT/script/sql/install-document-history.sql"
  sql -f "$REPO_ROOT/script/sql/grant-e2e-history.sql"

  # 後続の step が読む環境変数。値に改行は入らない（GITHUB_ENV へそのまま追記できる）。
  # NODE_OPTIONS はここに入れない。全ての node プロセスに効くため、必要な step だけが自分で付ける。
  (
    umask 077
    cat >"$dir/env" <<EOF
DATABASE_URL=$app_url
ISOLATED_NEON_PROXY=$proxy
SKILLSHEET_OWNER_ID=$owner_id
E2E_EMAIL=$E2E_EMAIL
E2E_PASSWORD=$E2E_PASSWORD
BETTER_AUTH_SECRET=$secret
EOF
  )
  log "ready (socket: $dir/sock, role: $OWNER_ROLE, owner: $owner_id)"
}

down() {
  local dir=$1
  [[ "$dir" == /* ]] || usage
  if [[ -f "$dir/bridge.pid" ]]; then
    kill "$(<"$dir/bridge.pid")" 2>/dev/null || true
  fi
  if [[ -d "$dir/data" ]]; then
    "$(pg_bin)/pg_ctl" stop -m immediate -D "$dir/data" >/dev/null 2>&1 || true
  fi
  rm -rf "$dir"
}

run() {
  [[ $# -gt 0 ]] || usage
  local base dir status=0
  base=$(mktemp -d)
  dir="$base/db"
  # shellcheck disable=SC2064
  trap "down '$dir'; rm -rf '$base'" EXIT
  up "$dir"
  set -a
  # shellcheck disable=SC1091
  . "$dir/env"
  set +a
  NODE_OPTIONS="--import $REPO_ROOT/script/isolated-neon-preload.mjs ${NODE_OPTIONS:-}" "$@" || status=$?
  return "$status"
}

case "${1:-}" in
  up) [[ $# -eq 2 ]] || usage; up "$2" ;;
  down) [[ $# -eq 2 ]] || usage; down "$2" ;;
  run) shift; run "$@" ;;
  *) usage ;;
esac
