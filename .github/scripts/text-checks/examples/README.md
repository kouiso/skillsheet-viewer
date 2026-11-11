# 書き方チェックと公開内容チェックの例

- `issue_ok.md` / `pr_ok.md` / `public_ok.md` は通る例（終了コード 0）。
- `issue_ng.md` / `pr_ng.md` は引っかかる例（終了コード 1）。
- 公開内容チェックの引っかかる例は、作り物の鍵などを含むため、ファイルには置かず
  `script/tests/test_text_checks.py` の中で文字をつないで作る（鍵の検査に誤って当たらないように）。
