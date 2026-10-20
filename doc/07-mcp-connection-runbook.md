# 07. MCP 接続確認の運用手順（Issue #331）

[06 Remote MCP](06-remote-mcp.md) の設計を前提に、Claude から本番の skillsheet-viewer へ MCP で接続し、
動作を確かめるための手順をまとめる。**認証設定（Better Auth / OAuth / 環境変数）は変更しない。**
手順はクライアント側の操作と読み取りの確認が中心で、書き込みは中身を変えない 1 回だけにする（2-2）。

- 本番 URL: `https://skill-sheet-snowy.vercel.app/api/mcp`
- 証跡: [mcp-evidence-20261014/](mcp-evidence-20261014/)（main `b45efe7d9` 時点）、
  [mcp-evidence-20261020/](mcp-evidence-20261020/)（main `274ec65` 時点）

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

### 1-1. 認可の入口（ログイン前まで）

ログインせずに、実クライアントの登録が通るかと、不正な要求が止まるかを確かめられる。
クライアント登録は CIMD（クライアントが公開するメタデータ URL を `client_id` にする方式）なので、
`client_id` には各クライアントの URL を入れる。

| 要求 | 期待値 |
|------|--------|
| Claude Code（`https://claude.ai/oauth/claude-code-client-metadata`、`http://localhost:<port>/callback`） | 302 で `/login` へ |
| claude.ai（`https://claude.ai/oauth/mcp-oauth-client-metadata`、`https://claude.ai/api/mcp/auth_callback`） | 302 で `/login` へ |
| 無いスコープ（`skillsheet:admin`） | 302 で redirect_uri へ `error=invalid_scope` |
| クライアントの登録に無い redirect_uri | 302 で `/api/auth/error?error=invalid_redirect` |
| URL でない `client_id` | 302 で `/api/auth/error?error=invalid_client` |

2026-10-20 の実測: [probe-authorize.txt](mcp-evidence-20261020/probe-authorize.txt)（すべて期待値どおり）。

## 2. Claude Code から接続する

```bash
claude mcp add --scope local --transport http skillsheet https://skill-sheet-snowy.vercel.app/api/mcp
claude mcp list        # 認可前は「! Needs authentication」
```

`--scope local` はそのプロジェクトディレクトリだけに登録する（他のプロジェクトへ影響しない）。

認可前の実測: [claude-code-connect.txt](mcp-evidence-20261014/claude-code-connect.txt)。

続けて端末で `claude mcp login skillsheet` を実行する（対話画面の `/mcp` → `skillsheet` → **Authenticate** でも同じ）。

1. ブラウザが開き、`/api/auth/oauth2/authorize` から `/login` に進む
2. **オーナーのアカウントで**ログインする（オーナー以外はトークン発行後も 403）
3. `/consent` に「スキルシートの閲覧」と「スキルシートの編集」の 2 行が出るので、許可する
   - Claude Code は 401 応答の `scope="skillsheet:read skillsheet:write"` をそのまま要求する
     （[claude-code-login.txt](mcp-evidence-20261020/claude-code-login.txt)）。同意画面はスコープを選び分けられない
4. 端末に戻り、`claude mcp list` が `✔ Connected` になる

### 2-1. 接続後の読み取り

- 「skillsheet の list_sheets を呼んで」→ シート一覧が返る
- 「get_sheet でそのシートを取って」→ ブロックと `revision` が返る

### 2-2. 書き込みの確認（中身を変えない 1 回）

書き込みの経路を通すが、シートの中身は変えない。`update_stats` に今と同じ値を渡す。

1. `get_sheet` の stats ブロックから、0 番目の `label` と `value` と、シートの `revision` を控える
2. 「update_stats を index 0、expectedLabel と fields.value は控えた値のまま、expectedRevision は控えた revision で呼んで」
   - 期待値: 成功し、`changes` は空、`revision` は新しい値になる（中身は同じで版だけ進む）
3. 同じ呼び出しを、**手順 1 で控えた古い revision のまま**もう一度呼ぶ
   - 期待値: `CONFLICT` の isError で、保存されない
4. `get_sheet` で stats の値が手順 1 と同じことを確かめる

編集タブを開いたまま手順 2 を行うと、タブ側の次の保存が競合になる（黙って上書きされない）。

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

- クライアント側の削除: `claude mcp logout skillsheet` で保存済みのトークンを消し、
  `claude mcp remove skillsheet -s local` で登録を外す。claude.ai はコネクタを削除
- アクセストークンは JWT で、`/api/mcp` は署名・iss・aud・exp だけを見る。
  クライアント側で消しても、手元に写しがあれば期限まで通る。期限は発行から 1 時間
  （`@better-auth/oauth-provider` の既定 `accessTokenExpiresIn: 3600`。アプリ側で上書きしていない）
- サーバー側の即時失効・MCP 全体の停止は [06 の「トークン失効」「ロールバック」](06-remote-mcp.md#トークン失効)を参照。
  **どちらも本番の DB・環境変数の変更になるので、オーナーの承認を得てから行う。**

## 6. 証跡の残し方

- 取得時の main の SHA と日時（UTC か PT を明記）を必ず書く
- トークン、Cookie、`set-cookie`、`x-vercel-id` などはファイルに残さない
- 認可前（Needs authentication）と認可後（Connected、`list_sheets` の結果）をそろえる

## 現状（2026-10-20）

| 項目 | 状態 |
|------|------|
| 公開 endpoint（401 / PRM / AS metadata） | 確認済み（probe-unauth.txt、probe-authorize.txt） |
| 認可の入口（Claude Code・claude.ai のクライアント登録、無効スコープ・redirect・client の拒否） | 確認済み（probe-authorize.txt） |
| Claude Code への登録と認可 URL | 確認済み（claude-code-login.txt。ログインの手前まで） |
| Fluid compute と実行ログ | 確認済み: Fluid 有効、既定の上限 300 秒、iad1。確認中の要求はすべて info で error 0 件（vercel-runtime.txt） |
| Claude Code の OAuth 認可 → Connected・読み取り・2-2 の書き込み | **未実施**: オーナーのログインが必要（手順 2） |
| claude.ai Custom Connector | **未実施**: オーナーの claude.ai と本アプリへのログインが必要（手順 3） |
| サーバー側の即時失効 | 未実施: 本番 DB の行を消す操作になるため、オーナーの承認が先（06 の「トークン失効」） |
