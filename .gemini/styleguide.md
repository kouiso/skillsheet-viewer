# Gemini Code Assist スタイルガイド

## 基本方針

### 言語
- 日本語でレビューコメント・提案を記述する
- コード内のコメントも日本語を推奨

### コードスタイル
- 既存のコードスタイル・設計パターンに従う
- プロジェクトのリンター・フォーマッター設定を尊重する

### レビュー方針
- バグ・セキュリティ問題を最優先で指摘
- パフォーマンス改善の提案
- 可読性・保守性の向上提案

---

## プロジェクト固有・繰り返し指摘チェックリスト

このプロジェクトは AI（Claude / Codex）が主体で実装しており、同種のミスが繰り返し発生している。
以下の各項目は過去の PR / コミットで実際に指摘・修正された再発パターンである。
レビュー時は必ずこのリストを確認し、該当する問題を検出した場合は重大度と修正例をセットで指摘すること。

### [A] 所有権検証漏れ / IDOR（security-high）

`sheetId` や `userId` を受け取って DB を delete/update/insert する前に、
その行が現在のセッションユーザー（ownerId）に属するか検証しているか確認する。
`session.user` の存在確認だけでは不十分——所有者 ID まで突き合わせること。

根拠: PR#56 `saveSkillSheetBlocks` に ownerId 検証なし / PR#44 `isEditor()` が有無のみ判定 / コミット e082cea で認可追加。

### [B] 非トランザクション化 / レース競合（medium〜high）

複数の DB 書き込み（insert+insert / delete→insert）が `db.transaction` で囲まれていない場合は指摘する。
seed・初期化処理に `onConflictDoNothing` 等のガードがない場合も同様。

根拠: PR#60 `createSheet` が sheet + blocks を別々に insert（Gemini high）/ コミット 23429d2 で tx 化。

### [C] エラー握り潰し・空フォールバック（medium）

`catch` ブロックで空配列・null・既定値を返し「データ無し」と「取得失敗」を混同していないか確認する。
`catch {}` の空ブロックも同様に指摘する。

根拠: コミット 9c5c28a で取得失敗を `[]` にしていた問題を修正。

### [D] 404 とシステムエラーの混同（medium）

あらゆる例外で一律 `notFound()` / null を返している実装を指摘する。
`SheetNotFoundError` のみ `notFound()`、その他は再スローするパターンを推奨する。

根拠: コミット 2aef084 で `SheetNotFoundError` を新設して区別。

### [E] エンコーディング / 日本語パス（medium）

App Router の `params` は Next.js が既にデコード済みのため、`decodeURIComponent` の再適用はクラッシュの原因になる。
パス検証の正規表現が `[a-zA-Z0-9]` 等で非 ASCII（日本語）を弾いていないか確認し、`\p{L}\p{N}` の使用を推奨する。

根拠: コミット 2aef084 で二重 decode のクラッシュと正規表現の Unicode 対応を修正。

### [F] Next.js 16 / RSC・状態・キャッシュ（critical / medium）

以下をすべて確認する:

- **【critical】** props 由来の初期 state を持つ Client Component で、親が `key`（例: `key={activeSheetId}`）を渡していない場合、シート切替後も stale な state が残る。
- `revalidateTag` に `expire` が指定されていない場合、TTL まで stale になる。
- 未保存ガードが `beforeunload` のみで、アプリ内 `<Link>` 遷移を素通りさせていないか。
- 複数描画されうるコンポーネント内で `document.querySelector` を使用している場合は `useRef` でスコープするよう指摘する。

根拠: PR#56 で `key={activeSheetId}` 欠落による stale state（critical）/ PR#44 で `revalidateTag` TTL 問題 / コミット 5ff03b6 で `useRef` 修正。

### [G] セキュリティ（XSS / CSRF / timing-safe）（security-high〜medium）

- `rehype-raw` や `dangerouslySetInnerHTML` に `rehype-sanitize` が併用されていない場合は XSS リスクとして指摘する。
- Origin / host の比較は `new URL(origin).host` による完全一致か確認する（substring 比較は CSRF リスク）。
- `timingSafeEqual` を長さの違う生の秘密値に直接適用している場合は長さリーク（タイミング攻撃）として指摘し、SHA-256 ハッシュ後に比較するよう推奨する。

根拠: コミット a958a6d / b8f945e で sanitize 追加 / c400c70 で Origin 完全一致化 / 5ff03b6 で timingSafeEqual 修正。

### **[H] Blob URL revoke タイミング（medium）【2回再発・最優先】**

`anchor.click()` 直後に同期で `URL.revokeObjectURL()` を呼び出している実装は
モバイル / Firefox でダウンロード失敗を引き起こす。`setTimeout` で遅延させ、
遅延値（例: `REVOKE_DELAY_MS = 100`）は定数として切り出すこと。

根拠: **PR#49 と PR#44 の両方（別ファイル）で同一の指摘が発生した再発パターン**。

### [I] 型安全 / 未検証の外部レスポンス（medium）

`as any` / `@ts-ignore` の使用、および外部 API レスポンスを型検証せず参照している箇所を指摘する。

根拠: コミット e082cea で GitHub レスポンスの型チェック追加。

### [J] マジックナンバー（low〜medium）

新規ロジック中にインラインな数値リテラルが登場した場合、名前付き定数への切り出しを推奨する（例: `REVOKE_DELAY_MS`）。

根拠: Gemini が複数 PR で繰り返し定数化を要求。

### [K] 過剰フィルタによるデータ脱落（medium）

「空」を一律除外するフィルタ（例: `isBlockInputEmpty`）が、テンプレの空ブロック等、
意図的に空であるドメインデータを落としていないか確認する。

根拠: PR#60 で `isBlockInputEmpty` がテンプレ空ブロックを除外していた問題。

### [L] PDF（@react-pdf/renderer）固有（medium）

- `wrap={undefined}` はバグ（テーブル重なり）の原因になる。
- 未登録フォントスタイル（italic 等）の使用を指摘する。
- `"use client"` 専用の `dynamic import` 境界を破った server-side import を指摘する。

根拠: コミット a958a6d で `wrap` バグ修正 / 1b3a962 で italic フォント未登録を修正。

### [M] サーバー専用モジュールのクライアント混入（high）

`"use client"` ファイルから `@skillsheet/db` や `server-only` パッケージを import している場合は指摘する。

根拠: プロジェクト prompt.md に明示されたルール。

### [N] 認証2系統の取り違え（high）

このプロジェクトの認証は2系統ある:
- **編集系**: Better Auth によるセッション認証
- **閲覧系**: HMAC（VIEWER_CODE）によるトークン認証

一方の系統を触る変更が、本来もう一方を触るべき動線になっていないか確認する。

根拠: プロジェクト prompt.md に明示されたルール。
