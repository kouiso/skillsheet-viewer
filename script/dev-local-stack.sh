#!/usr/bin/env bash
# ローカルに本番同等の実行環境を建てる。
#
# 本番 DB（Neon）へ到達できない環境（回線ポリシーで塞がれている等）でも
# 「実際に動かして確認する」を成立させるために使う。
#
#   1. ローカル PostgreSQL を起動して migrations を適用する
#   2. アプリが使う @neondatabase/serverless（WebSocket ドライバ）から
#      ローカル PostgreSQL へ橋渡しする TLS WebSocket プロキシを 127.0.0.1:443 に建てる
#      （アプリのコードは 1 行も変えない）
#   3. .env.local を用意する
#
# 使い方:
#   ./script/dev-local-stack.sh up      # 起動
#   ./script/dev-local-stack.sh down    # 停止
#   ./script/dev-local-stack.sh env     # アプリ起動時に必要な環境変数を表示
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${SKILLSHEET_LOCAL_STACK_DIR:-/var/lib/postgresql/skillsheet-local-stack}"
PGDATA="$STATE_DIR/pgdata"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_PORT="${PG_PORT:-5432}"
DB_NAME="${DB_NAME:-skillsheet}"
CERT_DIR="$STATE_DIR/cert"
PROXY_LOG="$STATE_DIR/wss-proxy.log"
PROXY_PID="$STATE_DIR/wss-proxy.pid"

# ドライバの pipelineConnect（パスワードを先行送信する最適化）に合わせるため、
# pg_hba は trust ではなく password にする。trust だと先行送信が
# 「invalid frontend message type 112」になる。
PG_USER=postgres
PG_PASSWORD=postgres

# principals 登録と .env.local 生成で同じ owner_id を使うため一元化する。
# 優先順位: 環境変数 > 既存 .env.local の SKILLSHEET_OWNER_ID > 既定値。
resolve_owner_id() {
  if [ -n "${SKILLSHEET_OWNER_ID:-}" ]; then
    printf '%s' "$SKILLSHEET_OWNER_ID"
    return
  fi
  local env_file="$REPO_ROOT/.env.local"
  if [ -f "$env_file" ]; then
    local v
    v="$(grep -E '^SKILLSHEET_OWNER_ID=' "$env_file" | tail -n 1 | cut -d= -f2-)"
    [ -n "$v" ] && { printf '%s' "$v"; return; }
  fi
  printf 'owner'
}

psql_admin() {
  PGPASSWORD="$PG_PASSWORD" psql -X -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" "$@"
}

log() { printf '\033[36m[local-stack]\033[0m %s\n' "$*"; }

ensure_postgres() {
  mkdir -p "$STATE_DIR"
  chown -R postgres:postgres "$STATE_DIR"
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    log "initdb $PGDATA"
    su postgres -c "$PG_BIN/initdb -U $PG_USER -A password --pwfile=<(echo $PG_PASSWORD) -E UTF8 --locale=C -D $PGDATA" >/dev/null
  fi
  if ! pg_isready -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
    log "starting postgres on $PG_PORT"
    su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l $PGDATA/server.log -o '-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1' start" >/dev/null
    sleep 3
  fi
  sed -i 's/^host\(.*\)trust$/host\1password/' "$PGDATA/pg_hba.conf"
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA reload" >/dev/null
  psql_admin -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1 ||
    psql_admin -c "create database $DB_NAME" >/dev/null
  ensure_migrations
  log "postgres ready ($DB_NAME)"
}

# 旧版は毎回 drizzle/migration/*.sql を全件再適用し、「already exists」だけを許容していた。
# DROP/ALTER 済みオブジェクトの再実行（例: 0002 の DROP CONSTRAINT）は
# 「does not exist」で止まり、up を二度目に実行した環境で必ず失敗していた（#373）。
# 適用済みファイルを skillsheet_local.applied_migrations に記録して、
# 未適用分だけを単一トランザクション（-1）で適用する。
ensure_migrations() {
  local psql_db=(psql_admin -d "$DB_NAME")
  "${psql_db[@]}" -q -c "CREATE SCHEMA IF NOT EXISTS skillsheet_local" >/dev/null
  "${psql_db[@]}" -q -c "CREATE TABLE IF NOT EXISTS skillsheet_local.applied_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )" >/dev/null

  # 帳簿導入前の旧版が作った DB には適用記録が無い。テーブル群があるのに記録が空なら
  # 「旧版が最後まで適用した DB」かを、帳簿導入時点の最新ファイル
  # （0010_stale_silk_fever.sql）の成果物 deleted_sheet_ids で確認する。
  # 揃っていればそのファイルまでを適用済みとして記録する。揃っていない中途半端な DB は
  # どこまで適用済みか判別不能なため、使い捨ての開発 DB として作り直しを促す。
  if ! "${psql_db[@]}" -tAc "SELECT 1 FROM skillsheet_local.applied_migrations LIMIT 1" | grep -q 1; then
    if "${psql_db[@]}" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='skill_sheets'" | grep -q 1; then
      if "${psql_db[@]}" -tAc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='skillsheet_state' AND column_name='deleted_sheet_ids'" | grep -q 1; then
        local f base
        for f in "$REPO_ROOT"/drizzle/migration/*.sql; do
          base="$(basename "$f")"
          # 帳簿導入時点の最新（0010）以降に追加されたファイルは未適用のはずなので記録しない。
          [[ "$base" > "0010_stale_silk_fever.sql" ]] && continue
          "${psql_db[@]}" -q -c "INSERT INTO skillsheet_local.applied_migrations (filename) VALUES ('$base')" >/dev/null
        done
        log "既存 DB に適用済みマイグレーションの記録を移行しました"
      else
        printf '%s\n' "$DB_NAME は旧版の途中適用状態の可能性があります。開発用 DB のため drop して作り直してください:
  PGPASSWORD=$PG_PASSWORD dropdb -h 127.0.0.1 -p $PG_PORT -U $PG_USER $DB_NAME && $0 up" >&2
        return 1
      fi
    fi
  fi

  local f base out
  for f in "$REPO_ROOT"/drizzle/migration/*.sql; do
    base="$(basename "$f")"
    "${psql_db[@]}" -tAc "SELECT 1 FROM skillsheet_local.applied_migrations WHERE filename='$base'" | grep -q 1 && continue
    if ! out=$("${psql_db[@]}" -q -1 -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
      printf '%s\n' "$out" >&2
      log "migration failed: $f"
      return 1
    fi
    "${psql_db[@]}" -q -c "INSERT INTO skillsheet_local.applied_migrations (filename) VALUES ('$base')" >/dev/null
  done
}

# drizzle の migrations は public のテーブル群しか作らない。閲覧・編集は
# skillsheet_private の境界関数（SECURITY DEFINER）を通るため、未 install の DB では
# /view が「schema skillsheet_private does not exist」で全滅する（#373）。
# CI の e2e（.github/workflows/ci.yml）と同じ順序で揃える:
#   1. install-skillsheet-read-boundary.sql（schema・principals・read 関数）
#   2. install-skillsheet-write-boundary.sql（write 関数）
#   3. 接続 role（$PG_USER）への schema USAGE + 関数 EXECUTE + principals 写像
# role は cluster 全域で共有され別 DB で作られている場合があるため、
# install には -v allow_existing_role=on を渡す（CI と同じ）。
ensure_boundary() {
  local psql_db=(psql_admin -d "$DB_NAME")
  # schema の有無ではなく関数の有無で判定する（install 済みかどうかの実体は関数）。
  # schema だけ残る partial install は境界 SQL 側の CREATE SCHEMA が非冪等なため
  # 失敗として表面化する。その方が壊れた状態を黙って通すより安全。
  if ! "${psql_db[@]}" -tAc "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='skillsheet_private' AND p.proname='read_snapshot'" | grep -q 1; then
    log "installing skillsheet read boundary"
    "${psql_db[@]}" -v ON_ERROR_STOP=1 -v allow_existing_role=on \
      -f "$REPO_ROOT/script/sql/install-skillsheet-read-boundary.sql" >/dev/null
  fi
  if ! "${psql_db[@]}" -tAc "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='skillsheet_private' AND p.proname='replace_sheet'" | grep -q 1; then
    log "installing skillsheet write boundary"
    "${psql_db[@]}" -v ON_ERROR_STOP=1 -v allow_existing_role=on \
      -f "$REPO_ROOT/script/sql/install-skillsheet-write-boundary.sql" >/dev/null
  fi
  # 権限付与と principals 登録は boundary role（owner）としてしか実行できない。
  # CI と同じく、接続 role へ membership を一時貸出 → SET ROLE → 付与 → REVOKE で通し、
  # cluster 全域に membership は残さない。principals は SESSION_USER（= $PG_USER）を
  # owner_id へ写像する。EXECUTE 未付与・写像なしだと境界関数が 42501 で全滅する。
  "${psql_db[@]}" -v ON_ERROR_STOP=1 -v owner_id="$(resolve_owner_id)" >/dev/null <<'SQL'
GRANT skillsheet_document_reader, skillsheet_document_writer TO CURRENT_USER WITH SET TRUE;
SET ROLE skillsheet_document_reader;
GRANT USAGE ON SCHEMA skillsheet_private TO SESSION_USER;
GRANT EXECUTE ON FUNCTION
  skillsheet_private.read_snapshot(uuid, text),
  skillsheet_private.list_sheets(text)
TO SESSION_USER;
INSERT INTO skillsheet_private.principals (login_name, owner_id)
  VALUES (SESSION_USER, :'owner_id')
  ON CONFLICT (login_name) DO UPDATE SET owner_id = EXCLUDED.owner_id;
SET ROLE skillsheet_document_writer;
GRANT EXECUTE ON FUNCTION
  skillsheet_private.replace_sheet(uuid, text, text, jsonb, text),
  skillsheet_private.create_sheet(uuid, text, jsonb, text),
  skillsheet_private.delete_sheet(uuid, text, text)
TO SESSION_USER;
RESET ROLE;
REVOKE skillsheet_document_reader, skillsheet_document_writer FROM CURRENT_USER;
SQL
}

ensure_cert() {
  mkdir -p "$CERT_DIR"
  if [ ! -f "$CERT_DIR/cert.pem" ]; then
    openssl req -x509 -newkey rsa:2048 -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -days 3650 -nodes \
      -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" >/dev/null 2>&1
  fi
  # 実行環境が既に NODE_EXTRA_CA_CERTS を使っている場合があるので、上書きせず結合する。
  local base=""
  [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "${NODE_EXTRA_CA_CERTS}" ] && base="${NODE_EXTRA_CA_CERTS}"
  cat ${base:+"$base"} "$CERT_DIR/cert.pem" > "$CERT_DIR/ca-combined.crt"
}

ensure_proxy() {
  if [ -f "$PROXY_PID" ] && kill -0 "$(cat "$PROXY_PID")" 2>/dev/null; then
    log "wss proxy already running"
    return
  fi
  # pid ファイルが無くても 443 が既に開いていることがある（他の起動経路・
  # 手動起動の残留など）。そのまま listen しに行くと EADDRINUSE で落ちて
  # 「起動した」と誤認するため、先に確認して再利用する。
  if (exec 3<>"/dev/tcp/127.0.0.1/443") 2>/dev/null; then
    log "wss proxy already listening on 443 (pid file なし。他経路で起動済みとみなす)"
    return
  fi
  PG_PORT="$PG_PORT" node "$REPO_ROOT/script/wss-pg-proxy.mjs" > "$PROXY_LOG" 2>&1 &
  echo $! > "$PROXY_PID"
  sleep 2
  # 起動に失敗しても 2 秒後に「起動した」と出てしまうと、あとでアプリ側が
  # 接続エラーになった理由が分からなくなる。生存確認してから成功とみなす。
  if ! kill -0 "$(cat "$PROXY_PID")" 2>/dev/null; then
    rm -f "$PROXY_PID"
    cat "$PROXY_LOG" >&2
    log "wss proxy failed to start"
    return 1
  fi
  log "wss proxy on 443 (log: $PROXY_LOG)"
}

write_env() {
  local target="$REPO_ROOT/.env.local"
  if [ -f "$target" ]; then
    log ".env.local はあるので触らない"
    # DATABASE_URL がこのローカルスタック以外を指していると、今回整えた境界・権限は
    # その接続先には適用されない。共有 DB では install-runtime-role.sql で
    # 開発者 role に EXECUTE と principals を付けてもらう必要がある（README 参照）。
    if ! grep -q "127.0.0.1:$PG_PORT/$DB_NAME" "$target"; then
      log "注意: .env.local の DATABASE_URL はローカルスタック以外を指している可能性があります"
    fi
    return
  fi
  cat > "$target" <<ENV
DATABASE_URL=postgresql://$PG_USER:$PG_PASSWORD@127.0.0.1:$PG_PORT/$DB_NAME?sslmode=disable
VIEWER_CODE=view123
SESSION_SECRET=local_only_session_secret_0123456789abcdef
BETTER_AUTH_SECRET=local_only_better_auth_secret_0123456789ab
BETTER_AUTH_URL=http://127.0.0.1:3000
SKILLSHEET_OWNER_ID=$(resolve_owner_id)
APP_ENV=development
REVALIDATE_SECRET=local_revalidate_secret
ENV
  log "wrote .env.local"
}

case "${1:-up}" in
  up)
    ensure_postgres
    ensure_boundary
    ensure_cert
    ensure_proxy
    write_env
    log "done. 次はこれでアプリを起動する:"
    echo "  NODE_EXTRA_CA_CERTS=$CERT_DIR/ca-combined.crt pnpm dev"
    ;;
  down)
    [ -f "$PROXY_PID" ] && kill "$(cat "$PROXY_PID")" 2>/dev/null && rm -f "$PROXY_PID" && log "proxy stopped"
    su postgres -c "$PG_BIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1 && log "postgres stopped" || true
    ;;
  env)
    echo "NODE_EXTRA_CA_CERTS=$CERT_DIR/ca-combined.crt"
    ;;
  *)
    echo "usage: $0 [up|down|env]" >&2
    exit 1
    ;;
esac
