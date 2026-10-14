# 07. MCP 接続確認の運用手順（Issue #331）

[06 Remote MCP](06-remote-mcp.md) の設計を前提に、Claude から本番の skillsheet-viewer へ MCP で接続し、
動作を確かめるための手順をまとめる。**認証設定（Better Auth / OAuth / 環境変数）は変更しない。**
手順はすべてクライアント側の操作と、読み取りだけの確認で構成する。

- 本番 URL: `https://skill-sheet-snowy.vercel.app/api/mcp`
- 証跡: [mcp-evidence-20261014/](mcp-evidence-20261014/)（main `b45efe7d9` 時点で取得）

## 1. 事前確認（トークン不要・読み取りのみ）

```bash
H=https://skill-sheet-snowy.vercel.app
curl -s -o /dev/null -w '%{http_code}\n' $H/api/mcp                                         # 405（GET は不可）
curl -s -i -X POST -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' $H/api/mcp | grep -i '^HTTP\|www-auth'  # 401 + WWW-Authenticate
curl -s $H/.well-known/oauth-protected-resource/api/mcp                                     # 200
curl -s $H/.well-known/oauth-authorization-server/api/auth                                  # 200, client_id_metadata_document_supported: true
```

期待値と一致しない場合（`/api/mcp` が 404 など）は MCP が無効化されているか `0006` 未適用。
[06 の「有効化の順序」](06-remote-mcp.md#環境変数)を見て、**自分で設定を変えずに**オーナーへ確認する。

2026-10-14 の実測: [probe-unauth.txt](mcp-evidence-20261014/probe-unauth.txt)（すべて期待値どおり）。

## 2. Claude Code から接続する

```bash
claude mcp add --scope local --transport http skillsheet https://skill-sheet-snowy.vercel.app/api/mcp
claude mcp list        # 認可前は「! Needs authentication」
```

`--scope local` はそのプロジェクトディレクトリだけに登録する（他のプロジェクトへ影響しない）。

認可前の実測: [claude-code-connect.txt](mcp-evidence-20261014/claude-code-connect.txt)。

続けて Claude Code の対話画面で `/mcp` → `skillsheet` → **Authenticate** を選ぶ。

1. ブラウザが開き、`/api/auth/oauth2/authorize` から `/login` に進む
2. **オーナーのアカウントで**ログインする（オーナー以外はトークン発行後も 403）
3. `/consent` でスコープ（`skillsheet:read` / `skillsheet:write`）を確かめて許可する
4. Claude Code に戻り、`claude mcp list` が `✔ Connected` になる

接続後の確認（読み取りのみ。書き込みツールは本番データを変えるので、確認目的では呼ばない）:

- 「skillsheet の list_sheets を呼んで」→ シート一覧が返る
- 「get_sheet でそのシートを取って」→ ブロックと `revision` が返る

## 3. claude.ai Custom Connector から接続する

1. claude.ai の 設定 → Connectors → カスタムコネクタを追加
2. URL に `https://skill-sheet-snowy.vercel.app/api/mcp` を入れる
3. OAuth 同意画面でオーナーとしてログインし、許可する
4. 新しい会話で「list_sheets を呼んで」と頼み、一覧が返ることを確かめる

## 4. MCP Inspector で全ツールを確かめる

```bash
npx @modelcontextprotocol/inspector
```

Transport `Streamable HTTP`、URL に本番 URL を入れ、Authentication の OAuth フローを通す。
`tools/list` が 8 ツールを返すこと、読み取り 3 ツールが値を返すことを見る。

## 5. 失効・切断

- クライアント側の削除: `claude mcp remove skillsheet -s local`、claude.ai はコネクタを削除
- サーバー側の即時失効・MCP 全体の停止は [06 の「トークン失効」「ロールバック」](06-remote-mcp.md#トークン失効)を参照。
  **どちらも本番の DB・環境変数の変更になるので、オーナーの承認を得てから行う。**

## 6. 証跡の残し方

- 取得時の main の SHA と日時（UTC か PT を明記）を必ず書く
- トークン、Cookie、`set-cookie`、`x-vercel-id` などはファイルに残さない
- 認可前（Needs authentication）と認可後（Connected、`list_sheets` の結果）をそろえる

## 現状（2026-10-14）

| 項目 | 状態 |
|------|------|
| 公開 endpoint（401 / PRM / AS metadata） | 確認済み（probe-unauth.txt） |
| Claude Code への登録 | 確認済み（Needs authentication まで） |
| Claude Code の OAuth 認可 → Connected | **未実施**: オーナーのブラウザログインが必要 |
| claude.ai Custom Connector | **未実施**: オーナーの claude.ai ログインが必要 |
| 失効・Fluid compute の確認 | 未実施（本番設定に触れるためオーナー承認待ち） |