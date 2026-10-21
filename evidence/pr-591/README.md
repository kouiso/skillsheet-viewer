# PR #591 証跡（履歴保持 dry-run）

- PR head: 2e172e5418d4bd86caf900b7e3884d92af53447c（feat/576-history-retention-dry-run）
- マージコミット: 8fd77f976079480c6d3a0f112da363b19dd7bb96（親 5838956fd49eb72ad67c572ae7075e243e7358f1 と 2e172e5）
- before: 5838956（#591 マージ前の main）。script/verify-history-retention.sh は無い → exit 127。
- after: 8fd77f9。script/verify-history-retention.sh の検証用コピーを使い捨ての PostgreSQL 17.11 cluster（unix socket のみ、合成データ）で実行 → 全項目 PASS、exit 0。
- 検証用コピーと実体の差分は 2 行（diff-real-vs-harness.txt）:
  1. run_dir を /tmp から作業フォルダへ移した
  2. 終了時の rm -rf data を無効にした
  処理の中身は同じ。
- 削除・apply・外部 DB への接続はしていない。

| ファイル | 内容 |
|---|---|
| dry-run-before-after.png | before / after の実行結果（SHA 入り） |
| before-5838956.log, after-8fd77f9.log | 実行ログ |
| diff-real-vs-harness.txt / .png | 実体と検証用コピーの差分 |
