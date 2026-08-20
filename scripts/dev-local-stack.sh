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
#   ./scripts/dev-local-stack.sh up      # 起動
#   ./scripts/dev-local-stack.sh down    # 停止
#   ./scripts/dev-local-stack.sh env     # アプリ起動時に必要な環境変数を表示
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
  PGPASSWORD="$PG_PASSWORD" psql -h 127.0.0.1 -U "$PG_USER" -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1 ||
    PGPASSWORD="$PG_PASSWORD" psql -h 127.0.0.1 -U "$PG_USER" -c "create database $DB_NAME" >/dev/null
  # 失敗を握り潰すと、スキーマが欠けたまま "postgres ready" と出てしまう。
  # 「既にある」系のエラーだけは想定内なので、それ以外は止める。
  for f in "$REPO_ROOT"/packages/db/drizzle/migrations/*.sql; do
    if ! out=$(PGPASSWORD="$PG_PASSWORD" psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$PG_USER" -d "$DB_NAME" -f "$f" 2>&1); then
      if grep -qiE 'already exists' <<<"$out"; then
        continue
      fi
      printf '%s\n' "$out" >&2
      log "migration failed: $f"
      return 1
    fi
  done
  log "postgres ready ($DB_NAME)"
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
  node "$REPO_ROOT/scripts/wss-pg-proxy.mjs" > "$PROXY_LOG" 2>&1 &
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
  local target="$REPO_ROOT/apps/web/.env.local"
  [ -f "$target" ] && { log ".env.local はあるので触らない"; return; }
  cat > "$target" <<ENV
DATABASE_URL=postgresql://$PG_USER:$PG_PASSWORD@127.0.0.1:$PG_PORT/$DB_NAME?sslmode=disable
VIEWER_CODE=view123
SESSION_SECRET=local_only_session_secret_0123456789abcdef
BETTER_AUTH_SECRET=local_only_better_auth_secret_0123456789ab
BETTER_AUTH_URL=http://127.0.0.1:3210
SKILLSHEET_OWNER_ID=owner
APP_ENV=development
REVALIDATE_SECRET=local_revalidate_secret
ENV
  log "wrote apps/web/.env.local"
}

case "${1:-up}" in
  up)
    ensure_postgres
    ensure_cert
    ensure_proxy
    write_env
    log "done. 次はこれでアプリを起動する:"
    echo "  cd apps/web && NODE_EXTRA_CA_CERTS=$CERT_DIR/ca-combined.crt npx next start -p 3210"
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
