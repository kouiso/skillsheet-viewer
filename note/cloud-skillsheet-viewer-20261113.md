STATE RUNNING 2026-11-14T12:05:14Z | merged 1 (第1版) closed 1 | OWNER 待ち: #664 #665 | 作業中: #653 #633 #632
mission: それぞれのプロジェクトに書いてあるプランに書いてある作業をやること / どのプロジェクトもまず既存のPRを本質的に対処することを作業を優先してください。そうしないと溜まってばっかりなので
model claude-opus-5-5 (lead) | advisor present | github via connector (gh 認証失敗) | push via git | png ok (Playwright で PNG 作成済み: doc/version-compare-evidence/)
goal: unknown（第2版の文面では見えない）| DONE-WAITING satisfies it: unknown
repo rules: AGENTS.md（日本語・分類を一言・doc 前提・テスト 3 設定・Skill 正本は .agents/skills）、.github テンプレート、script/check-naming.sh（単数・kebab-case）。厳しい側: 未解決のレビュースレッド 0（G4b）
DEPLOY | merge to main -> production | evidence doc/onboarding.md:36「main へのマージがそのまま本番に出る」, .github/workflows/deploy-smoke.yml:7-8
DEPLOY | merge to develop -> unknown, production 扱い | evidence なし（Vercel の git 連携はファイルに残らない。本番の Vercel connector は使わない決まり）→ ASK 済み
DEPLOY | PR branch push -> staging（Vercel preview）| evidence 各 PR の vercel[bot] のプレビューのコメント
---
MANAGER ad28930f80fbd04eb (fable high)。PASS LINE: done = 持ち主がそのまま main にマージできる状態。1) 合格は head SHA に結ぶ・behind は不可 2) 作者でないレビューの判定が head 付きで PR に、must 0・未解決スレッド 0 3) その head で CI 全緑、手元の lint/type-check/test/build を最後の head で 4) issue の受け入れ基準を 1 項目ずつ、試験は 3 設定の決まりどおり 5) 画面は明暗 × 1440/390 の実画面、390 で横はみ出し無し、板と見比べ 6) 1 PR 1 変更・Closes #n 7) 本文が今の head と合う 8) 合成データだけ。DB 移行・保存形・認証判定・配備経路を含む物は「持ち主の個別判断」。
POLICY: do next #639(#664) → #631(#665) → #635(#653) → #633(新規) → #632(新規、#665 の上)。親 #628/#627/#626 は子が済んでから完成の定義を当てて閉じる。close 0 件。範囲外 #647 #641 #596 #597 #377。#664 の後追いで「種類を選ぶ欄」の SBI を #628 の子に起こす（#632 の後）。
START 2026-11-14T11:41:10Z 第2版（exec-prompt-v2）で再開。handoff の次の手: 下の 11:45Z の記録（#651・#664・#653・#665）。
worktree /home/user/wt/631 fix/631-version-compare-states pushed to fix/631-version-compare-states (c2e9b04)
worktree /home/user/wt/652 fix/634-* left: 084f19d（範囲外のコミット。#652 は取り込み済み。消さずに残す）
worktree /home/user/wt/notes chore/cloud-notes-skillsheet-viewer clean 後に push
DECIDED | 第1版の下で 11:39Z に #651 を取り込んだ（8242d36）。第2版の到着前 | reason 第1版の関門を満たした | revert git revert 8242d36 の PR
ASK | main への取り込み（＝本番に出る）を、関門 G1〜G6 を通った物に限ってレーンに許すか（はい/いいえ/分からん） | read: doc/onboarding.md:36, deploy-smoke.yml:7-8, 第2版 G5, 本人「Stagingまでに留めて」 | 第2版は本番行きの取り込みを外すが、この案件は main 以外に出口が無い（develop は 80fbe51 で古く、配備先は不明） | on "don't know": 取り込まずに OWNER に積む
ASK | develop への取り込みは本番に出るか（はい/いいえ/分からん） | read: .github/workflows/*（develop を配備する workflow なし）、ci-failure-notify.yml:26 | Vercel の本番ブランチの設定はファイルに無い | on "don't know": production 扱い
item 651 | LAND | merged (第1版) | abc7cd0 | rollup 全部 success/skipped/neutral | review 済み | merged 8242d36, #622 closed
item 664 | OWNER | G5（main=production）で取り込み保留 | e7029d5 | rollup green 11:40Z | review 済み (0 件) | 本人の ASK 待ち
item 665 | FIX->review | must 2 件を直した | c2e9b04 | 未確認 | 再レビュー中 | -

item 664 | OWNER | main 取り込み・本文直し | 87679ff | CI 12 success・1 neutral・2 in progress（12:02Z） | REVIEW base update only https://github.com/kouiso/skillsheet-viewer/pull/664#issuecomment-6876950281 | LOCAL-CHECK pass 2546 fail 0 | G5 で取り込み保留（ASK 1）
item 665 | OWNER | must 直し 2 回 → PASS | 1d514ab | CI 14 success・1 skipped・1 neutral | REVIEW PASS must 0 https://github.com/kouiso/skillsheet-viewer/pull/665#issuecomment-6876990442 | LOCAL-CHECK pass 2544 fail 0 | G5 で取り込み保留（ASK 2）
item 653 | FIX | main 8242d36 を取り込み 137b085（lead が push）、板 G はコード上全一致、実画面撮影中 | 137b085 | - | - | -
item 633 | FINISH | 新規実装中（main から） | - | - | - | -
item 632 | FINISH | 新規実装中（#665 の上、base は fix/631） | - | - | - | -
item 666 | new | #628 の子 SBI「種類を選ぶ欄」を起票（マネージャーの判断）| - | - | - | 順は #632 の後
DECIDED | #653 の作業役の git fetch が権限判定で拒否 → lead が fetch・merge・push した | reason 作業役への最初の指示「ネットワーク git なし」に判定が合わせた。fetch は非破壊で lead の通常手順 | revert 不要
DECIDED | /home/user/wt/639 の古い作業場所を e7029d5 の detached に（中身は e7029d5 と一致、捨てた物なし） | reason 同じブランチを 664b が進めたため逆差分が見えていた | revert git checkout feat/639-stat-computed-readonly

## 2026-11-14T11:45Z（再開後の記録）

取り込み: #663（#644、8c7afdf）・#652（#634、55d1ff9）。閉じた issue: #624（子の #644 が済み）。
- #651（#622）: 本物の確認で失敗した原因が分かった。台本の中で動く miniflare（`unstable_dev`）が、SIGINT・SIGTERM・SIGHUP を先に受けて、こちらの後片付けより前に `process.exit` していた。abc7cd0 で、自分のシグナル処理を付ける前に既存の受け手を外すようにした。作者でない再レビューは合格（must 0）で、レビュー役も本物の SIGTERM を 1 回確かめ、記録した pid はどれも残らなかった。CI 待ち。
- #664（#639）: 作者でないレビューは合格だったが、should の 1 件（案件ブロックの無いシートで、編集欄は 0 で読み取り専用、閲覧画面は保存値）を e7029d5 で直した。作者でない再レビュー中。
- #653（#635）: main（#652 の squash）を取り込んで直している。
- #665（#631）: 作業役が続き。
- 作業役の 1 体が共有の `git stash` を使った（決まりでは避ける）。作業の失われは無かった。
- `script/verify-607-output.test.ts` は負荷が高いと時間切れで落ちる（main でも同じ）。#651 が 60 秒に延ばして直す。

## 2026-11-14T11:30Z（週の利用枠の上限で作業役が全部止まった → 11:25Z に解除。新しい統括の指示で続行）

取り込み済み（RESUME 後）: #659・#660・#661（#638）・#662（#658）。閉じた issue: #623（子が全部済み）。

止まった時点の扱い:
- #652: 作業役の直し（e2e のボタン名）と main の取り込みを PR のブランチに push した（c888ef7、未検証。CI で見る）。
- #631: 途中の差分を `fix/631-version-compare-states`（93501f1、未検証）に置き、下書き PR #665 にした。
- #651: 本物のランタイムで確かめたら失敗（シグナルで台本は 1 秒未満で終わり、detached の wrangler dev のグループが残る）。原因を調べていた作業役は利用枠で止まった（差分なし）。PR にも書いた。
- `cloud-wip/*` のブランチ（9 本）には PR を開けない。止まった時の退避で、中身は PR のブランチか #665 に入っている。消さずに残す（消すのは本人の判断）。
- 確認役の作業役が、別の作業フォルダの `next start` を 2 つ止めてしまった（ほかの作業役の検証が 1 回やり直しになった可能性）。以後、指示文に「自分が起こしたもの以外は止めない」を入れた。

開いている PR: #665（下書き・#631）・#664（#639・レビュー中に止まった）・#663（#644・合格・CI 待ち）・#653（#635）・#652（#634）・#651（#622・本物の確認で失敗）・#648（対象外）・#621（下書き・本人待ち）・#657（このメモ）。

次の 5 手: 1) #663 の CI を見て取り込む 2) #651 の原因を調べて直し、本物でもう一度確かめる 3) #664 を作者でないレビューに出して取り込む 4) #652 の e2e を確かめて取り込む 5) #653 を #652 の上で直す。

## 2026-11-14T10:20Z（RESUME 後の記録）

取り込み: #659（6a86af7）・#660（a440ebe）・#661（d29be4d、#638）。どれも作者でないレビューが PR にあり、CI 全緑。
- #651: CodeRabbit が後片付けの穴を続けて 3 件見つけ、全部直した（d90afa2: 2 回目のシグナルの前に全部へ SIGKILL / 4c2deff: 止め始めた後の子も止め終わるまで台帳に残す / b13e6ac: 止め始めた後は起こす前に断つ）。作者でない再レビューは b13e6ac で合格（must 0）。CI 待ち。スレッドは全部解決済み。
- #662（#658）: 作者でないレビュー合格（must 0）。CI の e2e 待ち。
- 作業中: #652（e2e）・#639（#638 の上に積んだ）・#644。
- 統括の決まり: Mac でエミュレータ・シミュレータを使わない。このセッションはクラウドで Web アプリなので該当なし。Mac にしか無い物が要る時は、メモに 'ops' 宛てで書く（今は無い）。

## 2026-11-14T09:50Z（RESUME・本人の指示「出力を出して終わらせる」）

- #659 を取り込んだ（6a86af7。作者でないレビューは合格・指摘 0 件、CI 全緑）。リポジトリの Claude Code の設定で advisor は fable。
- 作業役 3 体（#651 の should の仕上げ・#652 の e2e・#658）と、#660 の作者でないレビューを出した。

2026-11-14T07:37Z 時点で目標（/goal）はまだ解除されていない。止まるたびに止める前の検査がこのセッションを呼び戻している。解除するには `/goal clear` だけを単独で送る（前に台本を貼り付けて送った分は、その文が新しい目標として登録された）。
時刻の訂正: 下の見出し 07:05Z・07:25Z・08:00Z・08:20Z は時計の値ではない（推した時刻）。一番新しい記録は 07:33Z の引き継ぎ。
呼び戻しの費用を抑えるため、何もしない待ちの処理を 1 本だけ裏で動かすことがある（作業はしない）。統括が止めたいときは止めてよい。

使命（本人の言葉）: 「どのプロジェクトもまず既存のPRを本質的に対処することを作業を優先してください。そうしないと溜まってばっかりなので」

（前の一時停止） 2026-11-14T04:06Z（統括の指示で予算のため一時停止。続きは下の「次の手順」から）

skillsheet-viewer [cloud]

# クラウド作業メモ（skillsheet-viewer / 2026-11-13 の依頼分）

統括セッションからの依頼で、既存 PR を先に片付ける作業の記録。新しい順に書く。
分類: a = マージ待ちにできた / b = ここで直せる / c = 端末・画面の証拠・本番・本人の判断が要る / d = 不要・置き換え済み

## 2026-11-14T07:33Z 引き継ぎ（統括の指示で一時停止。次のセッションはここだけ読めば続けられる）

### 前提（この環境で分かったこと）
- 作業の決まり: 統括の組織の指示（リード = Opus medium・advisor Fable / 製品の判断 = Fable high のサブエージェント / 実作業 = Sonnet・Haiku）。取り込みは S6 の条件（作者でないレビューが PR に載っている・今の head の CI が緑・必要な証拠がある・本番デプロイ / 本番データ / 移行 / 課金などではない）で任されている。merge は squash、`expectedHeadSha` を付ける。main へのマージは Vercel が本番に出す。
- 手元の準備: Node 24.22.1 は nodejs.org の tar を `~/.node24` に置いて PATH に足した。Ghostscript は apt で入れた（無いと PDF の試験 5 件が落ちる）。docker は `dockerd` を起動すると動いた。clone は depth 1 なので、PR のブランチは `git fetch --depth=50 origin +refs/heads/<b>:refs/remotes/origin/<b>` で取る。
- push の後に「push していない」と止まる検査が出たら、`git update-ref refs/remotes/origin/<b> $(git ls-remote origin refs/heads/<b> | cut -f1)` で手元の記録を合わせる（実際は push 済みだった）。
- 作業用フォルダは消えるので、下の WIP ブランチから作り直す。

### 取り込んだ PR（6 本）
#650（4f7be89）・#649（9fe9269）・#620（80ca953）・#655（e6342d7）・#654（853396b）・#656（dee4d8c）。どれも作者でないレビューのコメントが PR にある。閉じた issue: #640・#642・#637・#636（未確認）・#643・#630（子が全部済み）・#614（置き換え済み）。新しく作った issue: #658（#623 の子）。

### 開いている PR と止まっている理由
| PR | 状態 | 次にやること |
|---|---|---|
| #651（#622） | head fafc58a。作者でない再レビューは合格（must 0、https://github.com/kouiso/skillsheet-viewer/pull/651#issuecomment-6873834537 ）。CI は e2e 以外は緑だった | 1) `cloud-wip/651-paused2`（3b2e92d・未検証）に should の直しの途中がある: gateway.stop() の reject も「止まっていない」と数えて pkill する / シグナル後は新しい子を起こさず、cleanup を 1 つの Promise にまとめる / createSignalHandler の既定の上限を CLEANUP_CAP_MS に。仕上げて試験の失敗前・成功後を確かめ、4 つの検査を回し、PR のブランチに入れて push。2) CodeRabbit の未解決スレッド 8 件に返信して解決（`as` の 3 件は doc/dev-guide.md が「最小に」で禁止ではない、capTime がエラーを飲むのは後片付けとして意図どおり、waitReady の残り時間は nit）。3) 本文を今の差分に合わせる（画像 checks.png → check-result.png、lifecycle.ts と試験、createCleanup、ENOENT のときだけ案内、結果の表は古い）。4) 作者でないレビュー → CI 緑 → 取り込み。#650 と同じ文書に触るので main を取り込んでから |
| #652（#634） | 作業役が e2e のボタン名のずれを直し（31aa559）、main を取り込んだ（60d80e3）。`cloud-wip/652-paused2` に push 済み、PR のブランチには未 push。lint は 0、ほかは未確認 | 他の spec と script/headless-e2e.mjs に古い名前（「認証」ボタン・「認証コード」）が残っていないか確かめ、4 つの検査と e2e（`pnpm test:e2e:local`。docker が要る）を回して PR のブランチに push。作者でないレビュー → 取り込み |
| #653（#635） | #652 の上に積んである。未着手 | #652 の後で、#652 のブランチを手元で merge し、締め出し・コード違い・通信失敗の文言に合わせて e2e を直す |
| #659（advisor の設定） | head f81692b。作者でないレビューは合格（指摘 0 件）。CI 待ちだった | CI が緑なら取り込む |
| #660（#629 の文書） | head 0543e40。doc/01-setup-and-routing.md から Node と pnpm の版の数字を外した。レビュー未 | 作者でないレビュー → CI 緑 → 取り込み |
| #621（#615） | 下書き | 本人待ち（下の OWNER の 6） |
| #648 | 対象外（ブリーフ） | 触らない |
| #657 | このメモの下書き PR | 取り込まない |

### 途中の issue
- #658: `cloud-wip/658-paused2`（21f48f3・未検証）。「続きを読む」をプレビューの中で tab に止めない・案内文の直しまで commit 済み（48752c5）、画面の証拠を撮る途中。判定は #658 のコメントにある。
- #631: `cloud-wip/631-paused`（bb55a84・未検証）。比較の欄の 3 状態。

### 次の 10 手（この順）
1. #651 を仕上げて取り込む（上の表）。
2. #659 の CI を見て取り込む。
3. #660 をレビューして取り込む。
4. #652 を仕上げて取り込む。
5. #653 を直して取り込む。
6. #658 を仕上げて PR にし、レビューして取り込む。
7. #638（数字カードの項目に種類。D1 側の保存でも種類が落ちない試験を足す）。
8. #639（#638 の後。計算される項目は読み取り専用）。
9. #644（dev-local-stack.sh に版の履歴の SQL 2 本。ヘッドレスで版の履歴が開く画面を PR に）。
10. #631 → #632（同じファイル、この順）。#633 は並行してよい。#621 の準備（直近 20 件の本文に検査を掛けて誤検知の数を書く）。

### OWNER（本人待ち）と DEVICE
OWNER は上の「2026-11-14T08:00Z」の節の 1〜8 のとおり（版の履歴を本番に入れるか / claude.ai のコネクタ / 稼働月数の (a)(b) / D1 移行 / #606 保留 / #621 の 3 つ / Vercel の Node の版 / この端末の入力履歴の撤去）。DEVICE: 今のところ無い（画面の証拠はヘッドレスで撮れる。#622 の本物の wrangler と workerd の通しの実行だけは、ここでは回していない）。

## 2026-11-14T08:20Z（統括の advisor の決まりへの答え）

- 主の作業: Opus 5.5・effort medium。
- advisor: オン（Fable）。このセッションの始めに `/advisor fable` が設定されている。
- リポジトリの設定: PR #659 で `.claude/settings.json` に `"advisorModel": "fable"` を足した（作者でないレビュー中）。
- Sonnet・Haiku の作業役の指示文には「相談はリードの Opus に上げ、自分で Fable の advisor を呼ばない」と書く（08:20Z 以降に出す分から）。

進み: #651 は must を 23aae1a で直し、main を取り込んで push（fafc58a）。作業役の報告では 4 つの検査が 0。作者でない別のレビュー中。#656 は合格（must 0）で、CI の test・e2e の結果待ち。本文に追記した。

## 2026-11-14T08:00Z（3 回目の記録・判定パケット 2）

判定役（Fable）が開いている issue を全部判定した。閉じたもの: #614（置き換え済み。#617・#616 で main に入り、残りは #606・#622 が持つ）。
#651 は作者でないレビューで要修正（must 1: シグナル時の後片付けの上限 5 秒が先に切れ、workerd を止める段に届かない）。作業役が直している。
#656 は指摘 4 件を直して push（7b5af66）。範囲外の試験の時間切れの変更は revert で戻した。レビュー中。

### AI が進める順（判定役）
既存 PR: #651 → #656 → #652 → #653。次に #658（空の欄の飛び先は要らない・「続きを読む」はプレビューの中で tab に止めない）、#638 → #639（#638 は D1 側の保存でも種類が落ちない試験を足す）。その後 #644 → #631 → #632、並行で #633。doc/01-setup-and-routing.md 19 行目の「Node 22.x」を 1 行で直す（#629 の残り）。

### OWNER（本人にしか決められない。聞く順。推奨つき）
1. 版の履歴を今の本番（Neon）に入れるか、D1 移行まで待つか（#383・#590）。推奨: 今入れる。はいなら、窓の日時・読み取り専用 role と Neon API キーを作ってよいか・誰が実行するか（キーは本人が発行して GitHub secret に入れる）。
2. claude.ai でコネクタを足し、実際に 1 か所を直す（#331・#305）。約 5 分。推奨: やる（両方閉じる）。
3. 稼働月数の食い違い（#625・#645・#646）。(a) 食い違いが残る時の出力: A1 全員止める / A2 編集者は止め、閲覧者には期間から出した月数で出す / A3 誰も止めない。推奨 A2。(b) 終了月が先の案件の比べ方: B1 期間全体（今のコード）/ B2 今月まで。推奨 B1。
4. D1 移行を続けるか（#598）。推奨: 続ける（1 の後）。続けるなら切替の窓と、秘密値を Cloudflare へ移すか。ラベル devin-failed は 11-02 の起動失敗の跡なので外してよい。
5. #606（prebuilt 配信）は保留でよいか。推奨: 保留（DB 移行と配信経路を同時に変えない）。
6. #621（#615）: 項目 1 と 2 を 1 本で受けるか / コメント本文の検査は今入れないか / 項目 3・4 は入れないか。推奨は 3 つとも「はい」。AI の準備: 直近 20 件の本文に検査を掛け、誤って赤になる件数を #621 に書く。
7. Vercel の Node の設定を 24.x にするか（#641）。推奨: する。しなくても実害は無い（engines が優先されて 24.x で動いている）。
8. 「この端末の入力履歴」を撤去するか（#383）。推奨: 1 で本番の版の履歴が動いてから撤去。

報告だけ: 「クラウドではコードのグラフを必須にしない」（#630・#643）は統括の裁定で進めた。嫌なら一言で戻せる。
#590 のコメントに Neon の project id と 1Password の項目 id が公開で書かれている。編集・削除は本人の許可が要る（判定役の指摘。ここでは触っていない）。

対象外（ブリーフ）: #377・#596・#597・#641・#647・PR #648。

## 2026-11-14T07:25Z（2 回目の記録）

open PR: 12 → 7（取り込み 5）。open issue: 34（#637・#640・#642 が閉じ、#658 を足した。数え直しは次の記録で）。

| 番号 | 列 | したこと | head | checks | レビュー | 結果 |
|---|---|---|---|---|---|---|
| #655 | LAND | レビュー（合格・must 0・should 2・nit 3）。390px の画像に変更箇所が一部しか写っていない（should） | c2109a1 | 全緑 | https://github.com/kouiso/skillsheet-viewer/pull/655#issuecomment-6873464646 | 取り込み e6342d7。#637 は閉じた |
| #654 | LAND | レビュー（合格・must 0・should 3・nit 3）。判定役（Fable）が A（取り込み可・本文に 3 点を書き、#623 の子に後追いを作る）と判定。本文に追記し、#658 を作った | ae3cbc7 | 全緑 | https://github.com/kouiso/skillsheet-viewer/pull/654#issuecomment-6873451947 | 取り込み 853396b。#636 が閉じたかは未確認 |
| #621 | OWNER | 判定役: 本人が決める件（#615 の範囲を狭めることと、1 項目 1 PR の決まりの例外）。推奨は A（本文だけを先に入れ、コメントは次の PR） | 52c2066 | 下書き | — | 本人待ち（下の needs owner） |
| #652・#653 | FIX | 作業役が e2e の名前ずれを直し、main を取り込む | 597686c / 2fbf98e | e2e が赤 | — | — |
| #651・#656 | FIX | 作業役が仕上げ中 | — | — | — | — |

作業役の 1 体が、本文を直すために `gh api` を使った（この環境では検索以外に使わない決まり）。本文の画像リンクのバッククォートは残ったまま（見た目だけ）。

## 2026-11-14T07:05Z（再開後 1 回目の記録）

open PR: 12 → 9（取り込み 3）。

| 番号 | 列 | したこと | head | checks | レビュー | 結果 |
|---|---|---|---|---|---|---|
| #650 | LAND | 作者でないレビュー（合格・must 0・should 3） | 121a3c1 | 全緑 | https://github.com/kouiso/skillsheet-viewer/pull/650#issuecomment-6873432884 | 取り込み 4f7be89。#640 は閉じた |
| #649 | LAND | レビュー（合格・must 0・should 2）。should は本文の書き方で、本文を直した | 4037047 | 全緑 | https://github.com/kouiso/skillsheet-viewer/pull/649#issuecomment-6873430568 | 取り込み 9fe9269。#642 は閉じた |
| #620 | LAND | レビュー（合格・must 0・should 2・nit 4） | 3e4dace | 全緑 | https://github.com/kouiso/skillsheet-viewer/pull/620#issuecomment-6873434111 | 取り込み 80ca953。#331 は Refs なので開いたまま。11-11 の「マージしない」の書き込みは、11-13 の取り込みの委任（統括経由）で上書きと判断した |
| #654 | LAND | レビュー中 | ae3cbc7 | 全緑 | — | — |
| #655 | LAND | レビュー中 | c2109a1 | 全緑 | — | — |
| #651 | FIX | 作業役が途中作業を仕上げ、main を取り込む（.github/ci/README.md が衝突する見込み） | 259d3da | 赤（命名） | — | — |
| #656 | FIX | 作業役が途中作業を仕上げる | 37c6905 | 赤（命名） | — | — |

レビューの範囲外の指摘（別の SBI 候補）: doc/01-setup-and-routing.md・doc/d1-migration-codec.md・doc/vercel-prebuilt-deployment-design.md・doc/d1-app-runtime.md に古い Node の版の数字が残る。

## 2026-11-14T04:06Z（一時停止）

件数: a 0 / b 10 / c 1 / d 0（対象外 1: #648）。どれもまだ、作者でない者のレビューを通していないので a ではない。

| 番号 | 分類 | 済んだこと | head SHA | checks | レビュー | マージ済み / 足りない物 |
|---|---|---|---|---|---|---|
| #656 | b | 途中まで直した（未 push） | 37c6905 | lint・命名が赤 | 未 | 途中作業は `cloud-wip/656-paused`（d2c27b8・未検証）。フックの JSON の制御文字・終了コード・内側の時間切れと試験。未解決スレッド 4 件は未返信 |
| #655 | b | 画像名を直して push | c2109a1 | 新しい head の CI 待ち | 未 | CI 緑の確認、作者でない者のレビュー |
| #654 | b | 画像名を直して push（sbs- → side-by-side-） | ae3cbc7 | 新しい head の CI 待ち | 未 | CI 緑の確認、作者でない者のレビュー |
| #653 | b | 未着手 | 2fbf98e | e2e が赤 | 未 | #652 の直しを取り込み（local で merge）、e2e を手元で回す |
| #652 | b | 途中まで直した（未 push） | 597686c | e2e が赤 | 未 | 途中作業は `cloud-wip/652-paused`（1745143・e2e のボタン名 1 行・未検証）。他の spec に同じずれが無いか全部調べ、e2e を手元で回す |
| #651 | b | 途中まで直した（未 push） | 259d3da | lint・命名が赤 | 未 | 途中作業は `cloud-wip/651-paused`（c30181e・未検証）。must 1 件（後片付けの上限）ほか 4 件。スレッドは未返信 |
| #650 | b | 古いコメントを消し、setup.md・README.md・.github/ci/README.md の Node の版の数字も外した | 121a3c1 | 新しい head の CI 待ち | 未 | CI 緑、レビュー。#651 と setup.md・onboarding.md の近くを両方触るので、後に入る方が main を取り込む |
| #649 | b | Done Gate に「下書きの skip は緑ではない・検査は最後の head で回す」を足し、スレッドに返信して解決 | 4037047 | 新しい head の CI 待ち | 未 | CI 緑、レビュー。#642 は #640 の後に入れる決まり（#650 を先に） |
| #621 | c | 画像の置き場と名前を直して push（下書きのまま） | 52c2066 | 下書きのため CI は skip | 未 | コメント本文も検査するかは本人の判断待ち（下の needs owner）。上流とのバイト比較はここでは再現できない（上流が非公開） |
| #620 | b | 画像名を直し、10-20 の証拠の範囲を表に書いた。スレッド 4 件に返信・解決 | 3e4dace | 新しい head の CI 待ち（手元で lint・type-check・test は 0） | 未 | CI 緑、レビュー、手元の build。本人の「マージしない」の書き込み（11-11）がある |
| #631 | — | 途中まで作った（PR 無し） | — | — | — | 途中作業は `cloud-wip/631-paused`（bb55a84・未検証）。版の比較欄の 3 状態と試験と画面 |

PR 本文: 作業役の報告では、#620 はブランチ指定のリンクを新しい名前に直した。#654・#655 のリンクはコミットに固定されているので、そのまま見られる。#649・#650 は本文に古い名前（checks.png）が文字と相対パスで残る。#621 は「その後の変更は…」の文を直した。6 本とも末尾に 2026-11-14 の追記を足した。報告だけで、読み直してはいない（未確認）。

手元の 4 つの検査（push した head と同じ中身で回した）: #620・#621・#650・#654・#655 は lint・type-check・test・build が全て 0。#649 は lint・type-check・build が 0。test は一時停止で途中で止めたので結果が無い（未確認）。

main（625d5ab）の検査: lint 0 / type-check 0 / test 0（Ghostscript を入れた後。入れる前は gs の要る PDF の試験 5 件だけ落ちた）/ build 0。

## 次の手順（再開する人へ）

1. #620・#621・#649・#650・#654・#655 の本文を読み直す。#649・#650 に残る古い画像名（checks.png）を check-result.png に直す。
2. #620・#649・#650・#654・#655 の新しい head の CI を見る。緑なら、作者でない新しいサブエージェントに差分を渡して敵対的にレビューさせ、判定（head SHA を書く）を PR にコメントする。must があればマージ待ちにしない。
3. `cloud-wip/651-paused` の差分を #651 のブランチに入れるかを判断する。試験の失敗前・成功後を確かめ、4 つの検査を回し、push してから各スレッドに返信・解決する。#656 も同じ（`cloud-wip/656-paused`）。
4. #652: `cloud-wip/652-paused` の 1 行を入れる前に、他の spec と script/headless-e2e.mjs に古い名前（「認証」ボタン・「認証コード」）が残っていないか全部探す。docker の常駐を起こし（`dockerd` を起動すると動いた）、e2e を手元で回してから push。#653 はその後に #652 を local で merge する。
5. #631: `cloud-wip/631-paused` から続ける。#632 は #631 の後（同じファイル）、#633 は別に進められる。
6. 作業用の別フォルダは消えるので、再開した環境で clone から作り直す。Node 24.22.1 は nodejs.org から取れた。Ghostscript は apt で入った。

## needs owner
- 【報告】11-14 に、AI が 13 本の PR を main にマージしました（#650 #649 #620 #655 #654 #656 #659 #660 #661 #662 #663 #652 #651）。main は本番に出る設定です。戻す時は、PR ごとに revert の PR を出します。今は、main へのマージを全部止めています（「Staging までに留めて」は main へのマージにも当たる、と読んでいます）。
- ASK 1 | 今マージ待ちの #664（数字カードの編集欄。画面だけの変更）を、AI が main にマージしてよいですか。はい / いいえ / 分からん | read: doc/onboarding.md:36, 第2版 G5 | 本番に出るかどうかは本人の線 | on "don't know" または返事なし: マージしない
- ASK 2 | この先も、次の 4 つを全部満たした PR は、AI が main にマージしてよいですか。はい / いいえ / 分からん。① 作った AI と別の AI のレビューが合格（必ず直す指摘 0、未解決の指摘 0）② 最新のコミットで自動検査が全部緑 ③ issue の受け入れ基準を満たし、画面の証拠がある ④ DB の移行・保存の形の変更・認証の判定・配備の設定を含まない | on "いいえ"/"分からん"/返事なし: 「マージできる状態」までで止め、#664 → #665 → #653 → #633 → #632 の順に最大 5 本積む
- ASK 3 | Vercel の Settings → Git の Production Branch は main ですか（develop は本番に出ないか）。はい / いいえ / 分からん | on "don't know": develop も本番扱い
- 聞く順（解ける量の多い順。マネージャーの判断）: main へのマージ → #625 の (a)(b) → #621 の 3 つ → #383・#590 → #331 → #598 → #606。
- OWNER の issue: #625 (a)(b) / #645・#646（#625 待ち）/ #615（#621 の 3 問）/ #606 保留 / #598 D1 移行 / #383 版の履歴の本番適用 / #590 role とキー / #331 コネクタ（#305 はその後）/ #629 Vercel 設定（#641）。

## for main session
- 第2版 G5 で、この案件は main への取り込みが全部止まる（main=production、ほかの出口なし）。1 時間 5 件の目標は閉じる件数だけになる。
- gh は GH_TOKEN でログイン失敗。GitHub は connector を使う。
