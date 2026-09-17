# 手動再検証スクリプト

修正済みの PDF 不具合を、**DB 上の実データに対して手で再確認する**ためのツール。

- `DATABASE_URL` が要るため、通常のテストスイート（`pnpm test`）には含めない
- 自動の回帰防止は `src/component/pdf/*.node.test.tsx` が担う。こちらは
  「実データでしか出ない崩れ」を疑ったときの調査用

| スクリプト | 対象 |
|---|---|
| `repro-194-card-split.tsx` | 案件カードがページ境界で分割される（Issue #194） |
| `repro-203-hyphen.tsx` | 句点直後の日本語にハイフンが入る（Issue #203） |
| `duration-toggle-check.mjs` | 「稼働月数」トグルの ON/OFF で画面の月数表記が消える（Issue #288） |
| `pdf-toggle-check.mjs` | 同上トグルが生成 PDF にも効く（Issue #288） |

実行例（DB 直読み系）:

```bash
pnpm exec tsx script/manual-repro/repro-194-card-split.tsx
```

`duration-toggle-check.mjs` / `pdf-toggle-check.mjs` は DB ではなく
**起動中の dev サーバ + Playwright** で確認する（画面 → PDF 生成までの実経路を通すため）。
`VIEWER_CODE` または `SESSION_COOKIE`（`session` cookie の値）を環境変数で渡す:

```bash
PORT=3103 pnpm dev   # 別ターミナルで起動しておく
export $(grep '^VIEWER_CODE' .env.local)
pnpm exec node script/manual-repro/duration-toggle-check.mjs
pnpm exec node script/manual-repro/pdf-toggle-check.mjs
```
