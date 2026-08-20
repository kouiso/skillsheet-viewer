# 手動再検証スクリプト

修正済みの PDF 不具合を、**DB 上の実データに対して手で再確認する**ためのツール。

- `DATABASE_URL` が要るため、通常のテストスイート（`pnpm test`）には含めない
- 自動の回帰防止は `src/components/pdf/*.node.test.tsx` が担う。こちらは
  「実データでしか出ない崩れ」を疑ったときの調査用

| スクリプト | 対象 |
|---|---|
| `repro-194-card-split.tsx` | 案件カードがページ境界で分割される（Issue #194） |
| `repro-203-hyphen.tsx` | 句点直後の日本語にハイフンが入る（Issue #203） |

実行例:

```bash
pnpm --filter @skillsheet/web exec tsx scripts/manual-repro/repro-194-card-split.tsx
```
