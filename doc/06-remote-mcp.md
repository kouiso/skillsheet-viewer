# 06. Remote MCP サーバー（Issue #305）

Claude Code / claude.ai Custom Connector から、OAuth 2.1 で認証・認可された Remote MCP 経由でスキルシートを安全に読み書きするための機能。

関連ドキュメント: [02 認証](02-authentication.md) / [01 セットアップとルーティング](01-setup-and-routing.md)

---

## 全体像

```text
MCP クライアント（Claude Code / claude.ai / MCP Inspector）
  │  POST /api/mcp（JSON-RPC, Bearer token）
  ▼
app/api/mcp/route.ts ── MCP_ENABLED が無い環境では 404
  ▼
requireMcpAuth（@better-auth/mcp）
  │  JWT 署名検証（/api/auth/jwks）・iss・aud・exp
  ▼
createMcpDispatch（src/server/mcp/handler.ts）
  │  1. token sub === SKILLSHEET_OWNER_ID（不一致は 403）
  │  2. tools/call の対象ツールに必要なスコープを検査（不足は 403 insufficient_scope）
  ▼
createMcpHandler（@modelcontextprotocol/server, ステートレス）
  │  ツール実行
  ▼
src/server/sheet-service.ts …… tRPC と共有のサービス層
  │  オーナー照合・入力検証・楽観ロック・差分生成・キャッシュ失効
  ▼
src/db（Neon Postgres）
```

- エンドポイントは `POST /api/mcp` の 1 本のみ。SSE / Redis / MCP セッション保存はなし。
- Better Auth が OAuth 2.1 Provider を兼ねる（`jwt()` + `mcp()` + `cimd()`）。
- 認可コードフローの画面は `/login`（既存）と `/consent`（新設）。
- クライアント登録は CIMD（Client ID Metadata Document）のみ。DCR は開けない。

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `MCP_ENABLED` | いいえ | `'true'` で MCP 経路を公開。未設定でも Vercel 本番（`VERCEL_ENV=production`）では有効。`'false'` は常に無効化する逃げ道 |
| `MCP_RESOURCE_URL` | 本番は推奨 | 発行トークンの `aud` となる MCP URL（例: `https://<host>/api/mcp`）。未設定時は `BETTER_AUTH_URL + /api/mcp` |

本番で `MCP_RESOURCE_URL` を固定しないと、デプロイ URL が変わったとき既存トークンの `aud` と一致しなくなり全滅する。

> **有効化の順序**: `MCP_ENABLED=true`（または本番での自動有効化）は本来
> **その環境の `DATABASE_URL` へ `0006` マイグレーションを適用した後**が前提。
> 未適用でも `getAuth` が OAuth プラグインの init 失敗を捕捉し、プラグイン無しで
> 再構成するためログイン等は壊れず、`/api/mcp` は 404 に留まる
> （2026-09-16 に本番で auth 全体 500 化を実測した後にフォールバック化）。
> MCP を有効化するには対象 DB へ `pnpm db:migrate` 実行後に再デプロイする。

## スコープ

| スコープ | 許可するツール |
|---------|--------------|
| `skillsheet:read` | `list_sheets` / `get_sheet` / `search_projects` |
| `skillsheet:write` | `update_project_item` / `update_company` / `update_stats` / `add_project_item` / `reorder_project_items` |

- `skillsheet:write` は read を包含しない（権限分離）。
- スコープ不足の `tools/call` は HTTP 403 + `insufficient_scope` チャレンジ。
- token の `sub` が `SKILLSHEET_OWNER_ID` と一致しない場合は常に 403（スコープ以前に拒否）。

## ツール一覧

### 読み取り

| ツール | 説明 |
|--------|------|
| `list_sheets` | `id` / `title` / `updatedAt` の一覧 |
| `get_sheet` | 指定シートの全ブロック（hidden 含む編集者向け全件）+ `revision` |
| `search_projects` | 案件名・会社名・技術名の完全一致検索。`projectId`/`companyId` を必ず返す |

### 書き込み（すべて `expectedRevision` 必須・文書境界の revision CAS）

| ツール | 説明 |
|--------|------|
| `update_project_item` | 案件 1 件の指定フィールドだけ更新 |
| `update_company` | 会社 1 社の指定フィールドだけ更新 |
| `update_stats` | stats 項目を `index` + `expectedLabel` で対象確認して更新 |
| `add_project_item` | 案件追加（ID はサーバー側生成） |
| `reorder_project_items` | 全案件 ID の順序を一括指定（重複・欠落・未知 ID は拒否） |

書き込み成功時の返却は共通フォーマット:

```json
{
  "sheetId": "...",
  "targetId": "...",
  "revision": "...(次の expectedRevision に使う文書版)",
  "changes": [{ "field": "role", "before": "SE", "after": "TL" }]
}
```

`revision` は次の `expectedRevision` に使う。競合時は保存せず `CONFLICT` の isError 結果を返す。

## エラー規約

| 状況 | 応答 |
|------|------|
| 認証なし・不正 token | HTTP 401 + `WWW-Authenticate`（RFC 9728 チャレンジ） |
| スコープ不足 | HTTP 403 + `insufficient_scope` |
| token sub が他オーナー | HTTP 403 |
| 対象なし | `isError` + `NOT_FOUND` |
| 入力不正 | `isError` + `BAD_REQUEST` |
| 楽観ロック競合 | `isError` + `CONFLICT`（保存しない） |

## 接続・失効・ロールバックの運用手順

### 接続（Claude Code）

```bash
claude mcp add --transport http skillsheet https://<host>/api/mcp
```

初回のツール呼び出しで OAuth 認可が始まり、ブラウザで `/login` → `/consent` へ進む。
オーナーでログインしスコープを確認して許可すると、クライアントへ code が戻り token が発行される。

### 接続（claude.ai Custom Connector）

設定 → Connectors → カスタムコネクタ追加で `https://<host>/api/mcp` を登録。
OAuth 同意後に利用可能になる。**本番デプロイ済みの URL が必要**（ローカルでは検証不可）。

### 接続確認（MCP Inspector）

```bash
npx @modelcontextprotocol/inspector
```

Transport: Streamable HTTP、URL: `https://<host>/api/mcp` で接続し、
Authentication の OAuth フローを通して全ツールを呼ぶ。

### トークン失効

Better Auth の OAuth テーブル（`oauth_access_token` / `oauth_refresh_token`）の該当行を
削除または `revoked` を設定すれば、以後の検証は失敗し 401 になる。
（revoked 判定はトークン確認時に DB を参照する経路で有効。JWT のみの検証経路では
署名・iss・aud・exp が見られるため、即時失効させたい場合は行削除が確実。）

### ロールバック

`MCP_ENABLED` を外す（または `'true'` 以外にする）だけで、`/api/mcp` と
`.well-known` 経路は 404 に戻る。通常画面・tRPC・閲覧ゲートへの影響は無い。
発行済みトークンは検証経路ごと塞がれるため追加作業は不要。

## 設計上の注意

- **サービス層の共有**: MCP から tRPC HTTP API を内側で呼ぶ構成は Cookie 偽装経路に
  なるため禁止。`src/server/sheet-service.ts` を tRPC router と MCP ツールの双方が使う。
- **owner 照合**: 読み取りでも `getOwnerSheet`（owner 付き照合）を使う。
  owner 未確認の取得関数は MCP 経路では使わない。
- **閲覧コードは流用しない**: HMAC 閲覧 cookie は編集権を持たず、MCP 認証にも使わない。
- **削除ツールは作らない**: 削除は `hidden` 更新 + 画面操作で行う。
- **ログにシークレットを出さない**: エラー文言・SQL をレスポンスへ返さない。

## ローカル E2E 検証（実施済みの記録）

`script/dev-local-stack.sh` 相当のローカル Postgres + WS ブリッジ構成で、`pnpm dev` を
`DATABASE_URL=<ローカル>` / `MCP_ENABLED=true` / `BETTER_AUTH_URL=http://localhost:3106`
で起動して実測した（本番 Neon への書き込みは行っていない）。

- `/api/mcp`: トークン無し・不正トークン → 401（`WWW-Authenticate` に resource_metadata と scope）
- `sub` が他オーナーの JWT → 403
- `skillsheet:read` のみの JWT で `update_stats` → 403 `insufficient_scope`
- `skillsheet:read` JWT で `list_sheets` → 200（実データ）
- `read+write` JWT で `get_sheet` / `search_projects` / `update_stats` → 200
  （`update_stats` は before/after `changes` と更新後 `revision` を返却）
- 古い `expectedRevision` での再書き込み → `CONFLICT`（isError）
- 存在しない sheetId → `NOT_FOUND`（isError）
- `/.well-known/oauth-protected-resource/api/mcp` → 200（PRM）
- `/.well-known/oauth-authorization-server/api/auth` → 200（AS metadata、CIMD 対応宣言あり）
- `MCP_ENABLED` 未設定: `/api/mcp` と PRM は 404、`/login`・`/api/auth/get-session` は正常

JWT は `/api/auth/jwks` で生成されたローカル DB の署名鍵を使い、検証と同じ iss/aud/scope を
持つものをテスト用に発行した（ブラウザ経由の OAuth 認可ダンス自体は未実施）。

## 未検証事項（SBI4 の残作業）

- ブラウザ経由の OAuth 認可フロー（`/login` → `/consent` → code → token）の実測
- claude.ai Custom Connector の実接続（本番デプロイ後に行う）
- MCP Inspector での全ツール実測・トークン失効の実測
- Vercel 上での Fluid compute / ログ確認
