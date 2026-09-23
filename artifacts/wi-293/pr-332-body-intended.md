## Issue リンク / Link to Issue

Closes #293
Closes #292
### 概要

保存済みの案件本文から `**太字**` を外す処理（`unwrapEmphasis`）を、テキスト全体への一括適用から 1 行ずつの判定へ変更しました。

- 行全体が `**…**` だけで、前後が空行または本文の端にある行（独立段落）は、案件コメント内の小見出しとして残します
- 段落の途中にある太字行は、描画側の `collapseSoftBreaks` で前後の本文へ連結され小見出しとして表示されないため、これまでどおり外します
- 文中・閉じ忘れの `**` の扱いは変わっていません

実データ（対象シートを SELECT / dry-run）で書き換え対象が 13 件 → 10 件（フィールド単位）になることを確認済みです。`script/unwrap-emphasis.ts` の dry-run では `CHANGED_ITEMS 12 → 9`。

### 見て欲しいポイント

- [ ] 小見出し判定（行全体が太字のみ かつ 前後が空行・本文の端）が妥当か
- [ ] `src/db/text.test.ts` の追加ケース（見出し行は残る・文中の太字は外れる・段落途中の太字行は外れる）

### 見なくてもよいポイント

- [ ] `unwrapEmphasis` の呼び出し元は `script/unwrap-emphasis.ts` のみで、画面・PDF の描画コード自体には変更がありません（保存データを書き換える処理なので、反映後は両方に効きます）

### その他(あれば)

仕様上の判断（小見出しを独立段落に限定した理由）は PBI #292 へコメントで記録済みです。本PRはデータ書き換えスクリプトの dry-run 検証までで、DB への実書き込み（`--write`）は行っていません。

---

### PR チェックポイント

- [x] タイトルに タスク管理ツール のチケット番号が入っているか（細かい hotfix 以外）
- [x] 複数の変更が 1 つの PR に入り込んでいないか
- [x] 開発環境修正(環境変数の追加・ライブラリのインストール等)がある場合は周知しているか
- [x] AdminXXX or OwnerXXX の修正時、横展開でもう一方の同機能も修正しているか（AdminやOwnerは例）

### レビュー観点

- [x] 想定通りに動作するか
- [x] より良い書き方はないか？
- [x] より良い設計はないか？
- [x] 他の部分と書き方・命名・ディレクトリ構成等が異なっていないか？
- [x] 関数・コンポーネントの粒度は適切か？
- [x] その他(具体的に記述をしてください): 実データでの書き換え対象が 13 件 → 10 件になることを dry-run で確認


---

## Evidence (WI-293 verification run — Mac mini isolated worktree)

- **HEAD**: `cf5997b6b12c2a4853133a490c704defad638c6b` (`fix/bold-heading-keep`)
- **Worktree**: `/Users/kouiso/worktrees/skillsheet-wi-293-20260915` (shared checkout not switched)
- **vs origin/main**: ahead 3 / behind 0 (no rebase this run)
- **Changed files vs origin/main**:
  - `src/db/text.ts`, `src/db/text.test.ts` (in-scope)
  - also on branch: `.github/workflows/ci.yml`, `e2e/pdf-print-view.spec.ts` (unrelated to bold-fix; noted only)

### Commands & exit codes
```
pnpm exec vitest run --config vitest.config.node.ts src/db/text.test.ts  # EXIT_FOCUSED=0 (14 passed)
pnpm run type-check                                                     # EXIT_TYPECHECK=0
pnpm test                                                               # EXIT_PNPM_TEST=0
```

### Artifact paths (untracked; not committed)
- `/Users/kouiso/worktrees/skillsheet-wi-293-20260915/artifacts/wi-293/text-test.log`
- `/Users/kouiso/worktrees/skillsheet-wi-293-20260915/artifacts/wi-293/type-check.log`
- `/Users/kouiso/worktrees/skillsheet-wi-293-20260915/artifacts/wi-293/pnpm-test.log`
- `/Users/kouiso/worktrees/skillsheet-wi-293-20260915/artifacts/wi-293/exit-codes.txt`
- `/Users/kouiso/worktrees/skillsheet-wi-293-20260915/artifacts/wi-293/acceptance-note.txt`
- `/Users/kouiso/worktrees/skillsheet-wi-293-20260915/artifacts/wi-293/dry-run-status.txt`

### Dry-run (13→10 / CHANGED_ITEMS 12→9)
- Script present: `script/unwrap-emphasis.ts` (dry-run default; `--write` NOT run)
- **Blocked this run**: no `.env` / `DATABASE_URL`; `sops -d .env.enc` failed (age identity missing). Prior PR claim not re-confirmed here.

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->

## Summary by CodeRabbit

* **バグ修正**
  * 太字の小見出しが適切に保持されるようになりました。
  * 本文中や本文に続く太字表記では、太字記号が正しく除去されるようになりました。
  * 段落の結合時に、小見出しが本文へ誤って連結される問題を修正しました。

<!-- end of auto-generated comment: release notes by coderabbit.ai -->
