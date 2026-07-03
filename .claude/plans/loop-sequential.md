# Sequential Loop Runbook — skillsheet-viewer

## 実行順序

| # | issue | 依存 | 状態 |
|---|-------|------|------|
| 1 | #51 型付きブロック: スキル一覧 | なし | todo |
| 2 | #52 型付きブロック: 職務経歴 | なし | todo |
| 3 | #54 D&Dパレット投入 | なし | todo |
| 4 | #53 テンプレート機能 | #50 merge 必要 | waiting |

## Done Gate（各 issue 共通）
- `pnpm -r type-check` exit 0
- `pnpm -r --if-present test` exit 0
- `pnpm build` exit 0
- PR 作成 + Closes #<N>

## 停止条件
- #51 / #52 / #54 の PR が全部作成されたとき
- ユーザーが「止めて」と言ったとき
