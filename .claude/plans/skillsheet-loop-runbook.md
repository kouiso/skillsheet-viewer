# Skillsheet-viewer 完成 — 管理ループ Runbook

- **Pattern**: sequential（マイルストーン波ごとに実装→検証→コミット）
- **Mode**: safe（厳格な品質ゲート）
- **Branch**: `feat/skillsheet-completion`（origin/main=15569bb 分岐 / M1 = `2a3615d` コミット済み）
- **Executor**: ultracode Workflow（並列クラスタ）+ Codex/直接編集（override marker 有効）
- **開始時刻基準**: 2026-06-21

## ループ反復の手順（各イテレーション）
1. **実装**: 当該波のタスクを衝突しないファイルクラスタへ分け Workflow で並列実装。
2. **検証ゲート（safe）**:
   - `pnpm type-check` = exit 0（必須）
   - `pnpm build` = exit 0（サンドボックス無効で実機実行。Codex サンドボックスは lightbox CSS で os error 1 になるため直接実行）
   - `pnpm -r --if-present test` = green（テスト追加分含む）
   - 敵対レビュー（Workflow review フェーズ）で blocker/major ゼロ
3. **修正**: レビュー/型/テスト指摘を潰すまで反復（同カテゴリ3連続失敗で停止し原因報告）。
4. **コミット**: 波ごとに 1 コミット（ローカル。push はユーザー指示時のみ）。
5. **記録**: memory `skillsheet-completion-progress` を更新。
6. 次の波へ。

## 波の順序（autonomous-completable）
- **波1（実行中 wf_c27c4ff3-67f）**: P0-6/P1-12, P0-0/P1-1/BACKUP, P1-3/4/5/14, docs/prompt/P1-9/P1-7, P0-3/P1-13, テスト(P1-2)
- **波2**: M3 WIP 回収（claude/* の未取込み良部分。※ 波1で sanitize/PDF は実装済みのため差分のみ）, P1-10 zod env, P1-6 PDF バイトレンダリングテスト, P2系（TOC堅牢化/compare contentRef/Storybook smoke）
- **波3（要ユーザー資源・STOP境界）**: M2 ランタイム = Vercel deploy + secrets + BA-SEED(オーナーaccount) + `/login` E2E + Dogfood(本人の実経歴) / P0-2 prod migration baseline / P0-7 ブランチ保護 / リモートbrranch削除・bot一本化

## 停止条件（explicit）
- (A) 波1・波2 の autonomous タスクが全て検証済み＆コミット済み → 波3 入口で **STOP しユーザーへ報告**（Vercel access・secrets・オーナーaccount・実経歴が要るため）。
- (B) いずれかのゲートで同一カテゴリ 3 連続失敗 → STOP し原因報告。
- (C) ユーザー割り込み。
- ハードキャップ: 各波で進捗（drive-to-zero）が出ない場合は STOP。

## 安全
- ECC hook profile: 有効（未無効化を確認）。
- prod Neon は既に Better Auth テーブル所持 → migrate は baseline 必須（波3/P0-2）。新規 Neon はクリーン migrate 可（検証済み）。
- Neon scratch `br-fancy-haze-aqk1pp98`(mig_test) は使い捨て。最終的に削除（destructive のためユーザー確認）。
