# PR #584 証跡：本番の実測（2026-10-21）で容量の土台を置き換えた前後

before と after の SHA は、それぞれの checkout で `git rev-parse HEAD` したログの1行目。

- before: `c0a003d971c21d2e872a9a12cbadd148f9997eb6`（変えていない）
- after: `29dc45e689efe150799120e3be09bc8b78cecb15`
- 生成時刻（`date -u`、ログの2行目）: before `Wed Oct 21 04:53:38 AM UTC 2026` / after `Wed Oct 21 05:49:34 AM UTC 2026`
- 作り直した理由: 5810de61 の after は感度分析が 5 列（変えた前提 / 区分 / 月間増分 / 36か月後の履歴 / 上限到達）のままだった。29dc45e6 で「区分」が「変えた前提の区分」と「負荷の区分」に分かれたので、after のログ・md・png だけをその checkout から作り直した。
- この branch（evidence/pr-584）は before の head から切り、この README と同じ階層のファイルを足している。アプリのコードは変えていない。生成ログは `.gitignore` の `*.log` に弾かれるので、`doc/evidence/pr-584/*.log` だけ追跡する例外を足している。

| ファイル | 中身 |
|---|---|
| `projection-before.md` | before の checkout で `script/history-capacity-report.ts` を実行した出力（履歴以外 = 9.2 MiB、10/14 既存報告） |
| `projection-after.md` | after の checkout で同じコマンドを実行した出力（履歴以外 = 48.4 MiB、2026-10-21 13:23 JST 実測、空き 975.6 MiB） |
| `projection.diff` | 上の 2 つの unified diff |
| `projection-before.png` / `projection-after.png` | 月間モデルの表と normal の感度分析表。黄色は相手と違うセル（見出しが相手に無い列も含む）。上部はその checkout の `git rev-parse HEAD` と `date -u`。今回の after は 6 列 |
| `generate-before.log` / `generate-after.log` | 各 checkout の `git rev-parse HEAD`、`date -u`、生成コマンドの出力。末尾に PNG 生成の出力 |
| `render.py` | PNG を描く。SHA と時刻はログの先頭2行から読む |

before（c0a003d）の生成コマンドは前回のまま（依存の install はしていない。`node --experimental-strip-types` と、拡張子 `.ts` を補う resolve hook）。

after（29dc45e6）は worktree で `pnpm install --frozen-lockfile` したあと、文書と同じコマンドで出した。ログの 1 行目はその checkout の `git rev-parse HEAD`、2 行目は `date -u`。PNG は before を上書きしないよう `--only after`。

```bash
pnpm exec tsx script/history-capacity-report.ts --measurement script/fixture/history-measure-report.json
python3 doc/evidence/pr-584/render.py --only after
```

本番 Neon の読取（project `cool-boat-26004396`、branch main、2026-10-21 13:23 JST ／ 2026-10-20 21:23 PT）は SELECT と Neon API の読み取りだけ。本文は読んでいない。
本番には履歴表が無い（0 件）ので、月間の履歴増分は**未測定**。10/14 の値は既存報告として別に残している。
