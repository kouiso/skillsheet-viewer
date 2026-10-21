# PR #584 証跡：本番の実測（2026-10-21）で容量の土台を置き換えた前後

before と after の SHA は、それぞれの checkout で `git rev-parse HEAD` したログの1行目。

- before: `c0a003d971c21d2e872a9a12cbadd148f9997eb6`
- after: `5810de61176756a7d9609ded1e9524be4df3fadd`
- 生成時刻（`date -u`、ログの2行目）: before `Wed Oct 21 04:53:38 AM UTC 2026` / after `Wed Oct 21 04:53:39 AM UTC 2026`
- 作り直した理由: 前の after.png が未 push の b0a23aa から作られ、ラベルだけ書き換えられていた。
- この branch（evidence/pr-584）は before の head から切り、この README と同じ階層のファイルを足している。アプリのコードは変えていない。生成ログは `.gitignore` の `*.log` に弾かれるので、`doc/evidence/pr-584/*.log` だけ追跡する例外を足している。

| ファイル | 中身 |
|---|---|
| `projection-before.md` | before の checkout で `script/history-capacity-report.ts` を実行した出力（履歴以外 = 9.2 MiB、10/14 既存報告） |
| `projection-after.md` | after の checkout で同じコマンドを実行した出力（履歴以外 = 48.4 MiB、2026-10-21 13:23 JST 実測、空き 975.6 MiB） |
| `projection.diff` | 上の 2 つの unified diff |
| `projection-before.png` / `projection-after.png` | 月間モデルの表と normal の感度分析表。黄色は相手と違うセル。上部はその checkout の `git rev-parse HEAD` と `date -u` |
| `generate-before.log` / `generate-after.log` | 各 checkout の `git rev-parse HEAD`、`date -u`、生成コマンドの出力。末尾に PNG 生成の出力 |
| `render.py` | PNG を描く。SHA と時刻はログの先頭2行から読む |

生成コマンド（両 checkout で同じ。依存の install はしていない）:

```bash
node --experimental-strip-types --import <拡張子 .ts を補う resolve hook> \
  script/history-capacity-report.ts --measurement script/fixture/history-measure-report.json
```

本番 Neon の読取（project `cool-boat-26004396`、branch main、2026-10-21 13:23 JST ／ 2026-10-20 21:23 PT）は SELECT と Neon API の読み取りだけ。本文は読んでいない。
本番には履歴表が無い（0 件）ので、月間の履歴増分は**未測定**。10/14 の値は既存報告として別に残している。
