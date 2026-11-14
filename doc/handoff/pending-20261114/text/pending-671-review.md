REVIEW | reviewer: general-purpose, opus 5.5 medium | authored no commit on this PR | head ff909f6b2cfb16d1e054a793ee39ee80f30e2783 | axes: pass line, design, scope, tests, body vs diff, evidence | verdict FAIL | must 2 want 4 nit 3

対象: `fix/671-theme-colors-board` @ ff909f6b2cfb16d1e054a793ee39ee80f30e2783（2 コミット deb6095・ff909f6、どちらも作者は Claude。私のコミットは無い）。比べた main は 4d8ca7472897f1ed1eaae541f440a11c98cee636（`git ls-remote` で 2026-11-14 に確認）。

## must

### M1 main より 1 コミット遅れている（合格ライン 1）
- 遅れているコミット: `4d8ca74 [SBI][feature] 数字カードの編集欄…(#639)(#664)`。merge-base は 67b5fcd。
- `git merge-tree --write-tree 4d8ca74 ff909f6` は rc=0（衝突なし）。ただ、合格の判定は head に結びつけるので、main を取り込んだ新しい head で、lint・type-check・test と下の M2 をやり直す必要がある。

### M2 コントラストの e2e が head で通った証拠がない（#671 受け入れ基準 4・合格ライン 3）
- ff909f6 の check-runs は 0 件。PR がまだ無く、ci.yml は `pull_request` と main への push でしか動かない。commit status は `Vercel failure（Deployment rate limited）` の 1 件だけで、これはデプロイ枠の問題でありコードの失敗ではない。
- 本文 95 行目が「通る」と書いているのは単体試験（`src/test/contrast.test.ts`・`primary-contrast-guard.test.ts`）だけ。基準は「既存の試験と**コントラストの e2e**」で、`e2e/text-contrast.spec.ts`・`text-contrast-synthetic.spec.ts`・`contrast-render.spec.ts`・`input-contrast.spec.ts` の結果がない。
- 私の環境でも動かせなかった。Playwright のブラウザ（`~/.cache/ms-playwright`）と `.env.local`（SESSION_SECRET など）が無いため。PR を作った後の CI の e2e が緑になるか、隔離 DB（`./script/e2e-isolated-db.sh run pnpm test:e2e:playwright`）で LOCAL-CHECK を取れば閉じる。
- 補足: `text-contrast-synthetic.spec.ts` は、記録済みの `doc/contrast-evidence/result.json`（計測した組の数・違反数）と結果を比べる。色が変わっても計測した組の数は変わらないはずだが（未確認）、確かめるまでは通るとは言えない。

## want

### W1 証跡「案件ナビ（削除ボタン）」の行が、名前どおりの画面になっていない（本文 81 行目）
- `doc/theme-color-evidence/project-nav-dark-1440.png` と `builder-dark-1440.png`、`project-nav-light-1440.png` と `builder-light-1440.png` は、それぞれ md5 が同じ（ab15ef9e…・2578e042…）で、同じファイルが重複している。
- project-nav の 1440・390 どちらの画像にも削除ボタン（`.row-del`・`.co-del`）が写っていない（hover で出るボタンのため）。受け入れ基準 3 が求める画面（確認ダイアログ・閲覧コードの画面・ビルダーの主ボタン）はそろっているので must にはしない。行を外すか、hover した状態で撮り直すこと。

### W2 「390px で横あふれ無し」を測った値がない（本文 75 行目）
- PNG はすべて 390×844 のビューポートの撮影で、`scrollWidth` は記録されていない。#673 の本文は `scrollWidth`=390 を書いている。同じ書き方で、測った値を 1 行足すこと。画像で見る限り、確認ダイアログ（明 390）と閲覧コードの画面（暗 390）にはみ出しは見えない。

### W3 本文の AA の結論の文が表と合っていない（本文 73 行目）
- 「NG は 1 行のみ」とあるが、表の NG は 4 行ある。新しい色の NG が 2 行（`destructive 文字 新 on destructive/10 (背景上)` と `destructive-strong 新(#b64437)` で、中身は同じ組 #b64437/#f0e6e5 4.43）、今の色の NG が 2 行（3.89・4.13）。
- 「全て AA を満たすため変更した」は、「変えた色はすべて AA を満たす。満たさない 1 組（#b64437 on 背景上の destructive/10）があるので、明るい配色の `--destructive-strong` は変えない」と直すこと。
- 表の数値は、私の再計算（下）と全行一致した。

### W4 #673 の暗い配色の del/dels（#f28b7f / #2a1513）はこのブランチに入っていない（リードの判断が要る）
- このブランチは `--danger` / `--danger-soft` を変えていない。暗い配色は `app/globals.css:170-171` が #e9695c / #2a1715 のまま。渡されたボード c219f52…css の `.rv.dark` は `--danger:#e9695c; --danger-soft:#2a1715` なので、本文 17 行目の「元からボードと同値」は正しい。リードのメモにある「#2a1513」は c219f52 の値ではない。
- #f28b7f / #2a1513 は別のボード a3cf9fd…css の `--del` / `--dels`（`.dl.del` が使う）にある値。`--danger` をこの値に変えると、c219f52 のボードからずれる。差分の色を合わせるなら、差分専用の新しいトークン（例 `--diff-del` / `--diff-del-soft`）が要る。コントラストは #f28b7f on #2a1513 で 7.22、card #0f1316 の上で 7.80 なので、どちらも AA を満たす。
- #671 の受け入れ基準には入っていない。このブランチで扱うのか別の SBI にするのかを、リードが決めて本文に書くこと。

## nit

- N1 `app/globals.css:49-50` の古いコメント。「`--destructive-strong` をそのまま流用する（新規の色を増やさない）」とあるが、hover は新しい色 #9f3a2f になった。
- N2 `app/globals.css:46` の「3.88:1」と `app/login/page.tsx:59` の「#dc2626」は、旧値のときの話。いまの `--destructive`（#b64437）を背景上の destructive/10 に載せると 4.43:1 になる、と書き直すと、`-strong` を据え置く理由が読み取れる。`src/component/ui/button.tsx:18` の「5.21:1」（暗い配色の旧値）も同じく古い。
- N3 範囲: 暗い配色の `--warn-strong`（`app/globals.css:174`）は、issue の「2 か所」の外にある 3 つ目の色。本文に理由は書かれているので許容。ただ、明るい配色の `--warn-strong` #6b4400 は、ボードの warn-text #6b4e00 と違うままで、本文に触れていない（どちらも AA は満たす。7.95 / 7.18）。

## 各軸で見たもの

- 合格ライン: head の SHA、`git log` で main との差（M1）、merge-tree（衝突なし）、check-runs と status（M2）、`Closes #671` は本文 3 行目にある。変更はテーマの色 1 つにまとまっている（globals.css・viewer-console.css・証跡の PNG 16 枚）。
- 設計: ボード c219f52 の値と突き合わせた。
  - 暗い配色の主ボタン: primary-fill #14b8a6 / on-primary #03110f / hover #2dd4bf は一致。
  - 危険の色: danger #b64437 / #e9695c は一致。
  - 暗い配色の warn-text: #f0cf73 は一致。
  - 明るい配色の primary-fill: #08665e は据え置きで、ボードとも同じ。
  - viewer-console.css の暗い配色の行も同じ値に揃っている。
  - ボードの `.b.dng` の枠（60%）は今回入っていない。本文の「見なくてよい」の欄で #668 の担当とされている。
- 試験（head ff909f6、node 24、自分の worktree で実行）:
  - `pnpm lint` 0 / `pnpm type-check` 0
  - `pnpm test`: jsdom 112 files・1114 tests、node 77 files・1201 passed + 1 skipped、pdf 25 passed + 1 skipped。すべて通過。
  - `contrast.test.ts` は `app/globals.css` を読んで測る作りなので、新しい値が試験の対象に入っている（33 tests 通過）。
  - e2e は動かせなかった（M2）。
- AA の再計算（WCAG 相対輝度、自作スクリプト。ティントはアルファ 0.1 の sRGB 合成）。変えたトークンを使う場所を grep で洗い出して、組をすべて測った:
  - 明: #b64437 文字 on 背景 5.09 / card 5.42 / muted 4.86。白 on #b64437 5.42。白 on hover #9f3a2f 6.73。`-strong` #b91c1c on destructive/10（背景上 #f0e6e5）5.29、card 上（#f8eceb）5.60。枠 5.09（基準 3）。
  - 暗: #03110f on #14b8a6 7.73、on #2dd4bf 10.34。text-primary-dark #14b8a6 on 背景 7.83 / card 7.50 / muted 7.05 / accent 6.61 / primary/10 6.92。#e9695c on 背景 6.16 / card 5.90 / muted 5.55 / destructive/10 5.59・5.26。#0a0d0f on #e9695c 6.16、on #f08a80 8.03。#f0cf73 on warn-soft 11.04 / 背景 12.88 / card 12.34 / muted 11.60。danger on danger-soft 5.39。
  - AA を割る組は #b64437 on 背景上の destructive/10（4.43）の 1 組だけ。コード上は `bg-destructive/10` を使う 2 か所（`app/login/page.tsx:61`・`app/consent/page.tsx:75`）がどちらも `text-destructive-strong` なので、画面には出ない。
  - そのほかに確かめた使い方: `project-card.tsx:140`（on-accent on primary-dark）、`editor.css:396-402,459`、`version-history.tsx:131`、`use-workspace-confirm.tsx:99`、`builder-client.tsx:1029-1078`、`sync-bar.css:46,52`、`editor.css:920-923`、`workspace-topbar.tsx:124,254`。白文字を primary-dark や destructive の上に載せている場所は無い。
- 本文と差分: 色の値・変えたファイル・据え置きの理由は差分と一致。違うのは W1・W3。
- 証跡: 16 枚すべて 1440×900 または 390×844。そのうち 5 枚を開いた（confirm-danger-dark-1440・confirm-danger-light-390・project-nav-dark-1440・project-nav-dark-390・viewer-auth-dark-390）。暗い配色の保存ボタンと認証ボタンは #14b8a6 の地に濃い文字、確認ダイアログの危険ボタンは赤の文字と枠。データは「見本 太郎（架空）」「架空の在庫管理画面」など合成のものだけで、実在の個人情報は見当たらない。

---
_Generated by [Claude Code](https://claude.ai/code)_
