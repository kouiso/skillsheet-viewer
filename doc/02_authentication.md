# 02. 認証（2 系統）

skillsheet-viewer は用途の異なる 2 つの認証系統を持つ。**編集者**（スキルシートを更新する側）と **閲覧者**（共有された内容を見る側）を明確に分離し、権限混同を避ける設計になっている。

関連ドキュメント: [01 セットアップとルーティング](01_setup_and_routing.md) / [03 データ層](03_github_api.md)

---

## 全体像

| 系統 | 対象 | 認証方式 | 発行される資格情報 | 主なチェックポイント |
|------|------|---------|------------------|--------------------|
| 編集者 | オーナー本人 | Better Auth（email/password） | Better Auth セッション cookie | `isEditor()` / `getEditorUserId()` |
| 閲覧者 | 共有先 | 閲覧コード（`VIEWER_CODE`）| HMAC 署名 cookie（`session`） | `verifySessionToken()` / `requireViewer()` |

- 書き込み系（ビルダー保存・シート作成/削除）は **編集者（Better Auth セッション）必須**。
- 閲覧系（`/view` 配下）は **閲覧 cookie または編集者セッションのいずれか**で通す。
- 閲覧用 HMAC cookie は閲覧専用で、編集権限は一切持たない（旧来の「HMAC cookie を編集者認可へフォールバック」する挙動は廃止済み）。

---

## 編集者認証（Better Auth）

### 設定

`apps/web/src/lib/auth.ts` が Better Auth サーバーを構成する。DB は既存の Neon（Drizzle）を共用し、`drizzleAdapter` で `user` / `session` / `account` / `verification` テーブル（スキーマは `packages/db/src/schema.ts`）へマッピングする。

```ts
// src/lib/auth.ts（抜粋）
betterAuth({
  secret,                             // BETTER_AUTH_SECRET（32 文字以上）
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(createDb(url), {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    disableSignUp: true,              // 公開サインアップを塞ぐ（権限昇格防止）
  },
  session: { cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7 } },
});
```

要点:

- **単一オーナー運用**。`disableSignUp: true` で公開サインアップ endpoint（`/api/auth/sign-up/email`）を塞ぎ、第三者が自己登録して編集者になる権限昇格を防ぐ。オーナーアカウントは `SKILLSHEET_OWNER_ID` に対応する既存アカウントを利用する（ブートストラップ手順は `SETUP.md`）。
- `getAuth()` は遅延シングルトン。`DATABASE_URL` はリクエスト時にしか無いため、`next build` の静的解析で初期化されないようにしている。

### エンドポイントとログイン画面

- Better Auth の HTTP ハンドラは `app/api/auth/[...all]/route.ts` が `toNextJsHandler(getAuth())` で GET/POST を委譲する。
- ログイン画面は `app/login/page.tsx`（クライアント）。`@/lib/auth-client` の `signIn.email({ email, password })` を呼び、成功後は `?next=`（内部パスのみ許可）か既定の `/builder` へ遷移する。

### 認可のチェックポイント（DAL）

編集者認可の単一チェックポイントは `apps/web/src/server/auth-gate.ts`。

```ts
// src/server/auth-gate.ts（抜粋）
export async function getEditorUserId(): Promise<string | null> {
  const ownerId = process.env.SKILLSHEET_OWNER_ID;
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL || !ownerId) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId || userId !== ownerId) return null; // オーナー ID と突合
  return userId;
}

export async function isEditor(): Promise<boolean> {
  return (await getEditorUserId()) !== null;
}
```

- セッションの `user.id` が環境変数 `SKILLSHEET_OWNER_ID` と一致する場合のみ編集者とみなす。
- 多層防御: 公開サインアップは無効化済みだが、万一オーナー以外のアカウントがセッションを持っても編集者とは扱わない。
- 書き込み系 Server Action（`app/builder/actions.ts`）は proxy 任せにせず、アクション内でも先頭で `isEditor()` を再検証する。

---

## 閲覧者認証（HMAC 署名 cookie）

### フロー

1. 閲覧者は `/viewer-auth`（`app/viewer-auth/page.tsx`、クライアント）で共有された閲覧コードを入力する。
2. フォーム送信で `POST /api/auth` に `{ code }` を送る（`credentials: 'include'`）。
3. サーバーがコードを検証し、正しければ HMAC 署名 cookie を発行する。
4. 成功後、`?next=`（内部パスのみ許可・オープンリダイレクト防止）か既定の `/view` へ遷移する。

### コード検証（timingSafeEqual）

`app/api/auth/route.ts`（Node ランタイム）:

```ts
// app/api/auth/route.ts（抜粋）
const viewerCode = process.env.VIEWER_CODE ?? process.env.VITE_VIEWER_CODE;
const codeHash  = createHash('sha256').update(code, 'utf-8').digest();
const validHash = createHash('sha256').update(viewerCode, 'utf-8').digest();
if (!timingSafeEqual(codeHash, validHash)) {
  return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
}
const res = NextResponse.json({ ok: true });
const { name, ...options } = getSessionCookieOptions();
res.cookies.set(name, createSessionToken(), options);
```

- コードは平文比較せず、SHA-256 ハッシュ同士を `timingSafeEqual` で比較する（タイミング攻撃対策）。
- リクエストは `isSameOrigin` チェックで CSRF 由来のクロスオリジン POST を弾く。

### セッショントークンの署名と検証

`apps/web/src/server/session.ts` が HMAC トークンを生成・検証する。

- **トークン形式**: `base64url(payload).base64url(HMAC-SHA256(payload))`。payload は `{ iat, exp }`（有効期間 7 日）。
- 署名鍵は `SESSION_SECRET`。
- `verifySessionToken()` は署名を `timingSafeEqual` で照合し、長さ不一致・不正 base64・期限切れを弾く。

```ts
// src/server/session.ts（抜粋）
export function getSessionCookieOptions() {
  const env = process.env.VERCEL_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV;
  const secure = env === 'production' || env === 'preview';
  return { httpOnly: true, maxAge: SESSION_DURATION_SECONDS, name: 'session',
           path: '/', sameSite: 'strict' as const, secure };
}
```

- cookie は `httpOnly` / `sameSite: 'strict'`。
- **`secure` 判定**: Vercel では `VERCEL_ENV` を優先し、非 Vercel 環境では `APP_ENV` / `NODE_ENV` を見る。値が `production` か `preview` のとき `secure: true`（ローカル HTTP 開発では `false` になり cookie が付く）。

### ログアウト

`POST /api/logout`（`app/api/logout/route.ts`）が `session` cookie を `maxAge: 0` で失効させる。

---

## 閲覧ゲート（requireViewer）

`/view` 配下の閲覧認可の単一チェックポイントは `apps/web/src/server/viewer-gate.ts`。

```ts
// src/server/viewer-gate.ts（抜粋）
export async function requireViewer(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (verifySessionToken(token)) return;   // (a) 有効な閲覧 cookie
  if (await isEditor()) return;            // (b) 編集者としてログイン済み
  redirect('/viewer-auth');               // どちらも無ければ認証ページへ
}
```

- (a) 有効な HMAC 閲覧 cookie があるか、(b) Better Auth の編集者としてログイン済みなら閲覧を許可する。
- どちらも満たさなければ `/viewer-auth` へリダイレクト（`redirect()` は内部で例外を投げるため、許可時のみ正常 return する）。
- 呼び出し元は `app/view/layout.tsx`（`/view` 配下を一括保護）と `app/compare/page.tsx`（比較経由のバイパス防止）。

---

## 権限分離のまとめ

- 閲覧できても編集はできない: 閲覧 cookie は `requireViewer()` を通すだけで、`isEditor()` は Better Auth セッション必須なので書き込みは通らない。
- 編集者は閲覧もできる: `requireViewer()` は編集者セッションでも通る。
- 認可の入口を DAL（`auth-gate.ts` / `viewer-gate.ts`）に集約し、Server Action 側でも再検証する多層防御を採る。

---

## 実装方針追記（2026-06-21・完成プラン M0/M1）

### 認証の二系統分離
- 編集者（更新する側）= Better Auth（email/password）。`isEditor()` は Better Auth セッション必須。
- 閲覧者（見る側）= HMAC 署名 cookie（`VIEWER_CODE` / `/viewer-auth`）。閲覧専用で編集権限は一切持たない。
- 旧来の「HMAC cookie を編集者認可にフォールバック」する挙動は廃止（権限混同の解消）。

### owner_id の源（個人名リテラルの排除）
- `packages/db` の `OWNER_ID = 'kouiso'` ベタ書きを廃止し、`SKILLSHEET_OWNER_ID` 環境変数から取得する。
- 単一オーナー運用では、Better Auth で作成したオーナーアカウントに対応する安定IDを設定する。
- 書き込みは `isEditor()`（Better Auth セッション必須）でゲートし、認証されたオーナーのみが保存できる。

### DB ドライバ
- Better Auth の対話的トランザクションに対応するため、`neon-http` から `neon-serverless`（WebSocket）ドライバへ移行。
