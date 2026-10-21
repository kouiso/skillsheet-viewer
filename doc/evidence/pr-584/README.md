# PR #584 証跡：本番の実測（2026-10-21）で容量の土台を置き換えた前後

- PR #584 head（before）: `c0a003d971c21d2e872a9a12cbadd148f9997eb6`
- 変更後（after、push 済み head）: `415166624e0716b9cb129c295ba01481a6aa6839`
- この branch（evidence/pr-584）は before の head から切り、この README と同じ階層のファイルだけを足している。コードは変えていない。

| ファイル | 中身 |
|---|---|
| `projection-before.md` | before の `script/history-capacity-report.ts` 出力（履歴以外 = 9.2 MiB、10/14 既存報告） |
| `projection-after.md` | after の同じ出力（履歴以外 = 48.4 MiB、2026-10-21 13:23 JST 実測、空き 975.6 MiB） |
| `projection.diff` | 上の 2 つの unified diff |
| `projection-before.png` / `projection-after.png` | 月間モデルの表と normal の感度分析表。黄色は相手と違うセル（PIL で描画） |

生成コマンド（両 SHA で同じ。依存の install はしていない）:

```bash
node --experimental-strip-types --import <拡張子 .ts を補う resolve hook> \
  script/history-capacity-report.ts --measurement script/fixture/history-measure-report.json
```

本番 Neon の読取（project `cool-boat-26004396`、branch main、2026-10-21 13:23 JST ／ 2026-10-20 21:23 PT）は SELECT と Neon API の読み取りだけ。本文は読んでいない。
本番には履歴表が無い（0 件）ので、月間の履歴増分は**未測定**。10/14 の値は既存報告として別に残している。
